-- Phase 4: messaging (start, auto-reply, attachments), email outbox,
-- and private realtime channels for typing indicators.

-- ---------------------------------------------------------------------------
-- Start a conversation and its first message in one transaction.
-- SECURITY INVOKER: the caller's RLS policies and the conversation triggers
-- (brand-only starter, live listing, blocks, 25/day) all apply.
-- ---------------------------------------------------------------------------
create or replace function public.start_conversation(p_broker_org uuid, p_body text, p_brief uuid default null, p_attachments jsonb default '[]')
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_brand uuid := public.my_org_id(); v_conv uuid;
begin
  if p_body is null or char_length(trim(p_body)) = 0 then
    raise exception 'write a message' using errcode = '23514';
  end if;
  insert into public.conversations (brand_org_id, broker_org_id, started_by, brief_id)
  values (v_brand, p_broker_org, auth.uid(), p_brief)
  returning id into v_conv;
  insert into public.messages (conversation_id, sender_user_id, sender_org_id, body, attachments)
  values (v_conv, auth.uid(), v_brand, trim(p_body), coalesce(p_attachments, '[]'));
  return v_conv;
end $$;

-- Message timestamps use the real clock.
create or replace function public.messages_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
  v_other uuid;
begin
  select * into c from public.conversations where id = new.conversation_id;
  if not found then
    raise exception 'conversation not found' using errcode = '23503';
  end if;
  if new.sender_org_id not in (c.brand_org_id, c.broker_org_id) then
    raise exception 'sender is not part of this conversation' using errcode = '42501';
  end if;
  if new.sender_user_id is not null and not exists (
      select 1 from public.org_members where org_id = new.sender_org_id and user_id = new.sender_user_id) then
    raise exception 'sender is not a member of the sending organization' using errcode = '42501';
  end if;
  if c.declined_at is not null then
    raise exception 'this conversation is closed' using errcode = '42501';
  end if;
  v_other := case when new.sender_org_id = c.brand_org_id then c.broker_org_id else c.brand_org_id end;
  if exists (select 1 from public.org_blocks where blocker_org_id = v_other and blocked_org_id = new.sender_org_id) then
    raise exception 'messaging between these organizations is blocked' using errcode = '42501';
  end if;
  new.read_at := null;
  -- clock_timestamp, not now(): messages posted in one transaction (e.g. a
  -- first message and an away-mode auto-reply) keep their order.
  new.created_at := clock_timestamp();
  return new;
end $$;

-- Away mode: a broker's auto-reply is posted once, right after the brand's
-- first message in a new thread.
create or replace function public.messages_auto_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.conversations; v_msg text;
begin
  if new.is_auto_reply then return new; end if;
  select * into c from public.conversations where id = new.conversation_id;
  if new.sender_org_id <> c.brand_org_id then return new; end if;
  if exists (select 1 from public.messages where conversation_id = c.id and id <> new.id) then return new; end if;
  select away_message into v_msg from public.broker_listings where org_id = c.broker_org_id;
  if v_msg is not null and char_length(trim(v_msg)) > 0 then
    insert into public.messages (conversation_id, sender_user_id, sender_org_id, body, is_auto_reply)
    values (c.id, null, c.broker_org_id, trim(v_msg), true);
  end if;
  return new;
end $$;
create trigger messages_auto_reply after insert on public.messages
  for each row execute function public.messages_auto_reply();

-- Attachments are a JSON array of {path, name, size, type}; paths must live
-- under this conversation's folder in the private message-files bucket.
create or replace function public.messages_check_attachments()
returns trigger language plpgsql set search_path = '' as $$
declare a jsonb;
begin
  if jsonb_typeof(new.attachments) <> 'array' or jsonb_array_length(new.attachments) > 5 then
    raise exception 'up to 5 attachments per message' using errcode = '23514';
  end if;
  for a in select * from jsonb_array_elements(new.attachments) loop
    if (a ->> 'path') is null or (a ->> 'path') not like new.conversation_id::text || '/%'
       or coalesce((a ->> 'size')::bigint, 0) > 10485760
       or (a ->> 'type') not in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp') then
      raise exception 'invalid attachment' using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;
create trigger messages_attachments before insert on public.messages
  for each row execute function public.messages_check_attachments();

-- ---------------------------------------------------------------------------
-- Email outbox. Triggers enqueue; a server cron sends through Resend.
-- No client access at all.
-- ---------------------------------------------------------------------------
create table public.email_outbox (
  id bigint generated by default as identity primary key,
  to_user_id uuid references public.users(id) on delete cascade,
  to_email text,                         -- for admin/system mail without a user row
  kind text not null,                    -- new_conversation, new_message, broker_declined, ...
  payload jsonb not null default '{}',
  digest boolean not null default false, -- true: wait for the daily digest
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  attempts smallint not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  constraint email_outbox_target check (to_user_id is not null or to_email is not null)
);
create index email_outbox_due on public.email_outbox (send_after) where sent_at is null;
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;

-- Opted out of this kind via an unsubscribe link?
create or replace function public.email_opted_out(p_user uuid, p_kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (email_opt_outs ->> p_kind)::boolean from public.notification_prefs where user_id = p_user), false);
$$;

-- New message -> each member of the receiving org, per their preference,
-- unless they muted the thread or opted out.
create or replace function public.messages_enqueue_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
  v_to uuid;
  v_first boolean;
  v_kind text;
  v_pref public.email_frequency;
  v_brand text; v_broker text;
begin
  select * into c from public.conversations where id = new.conversation_id;
  v_to := case when new.sender_org_id = c.brand_org_id then c.broker_org_id else c.brand_org_id end;
  v_first := not exists (select 1 from public.messages where conversation_id = c.id and id <> new.id and created_at <= new.created_at);
  v_kind := case when v_first and v_to = c.broker_org_id then 'new_conversation' else 'new_message' end;
  if new.is_auto_reply then return new; end if;
  select name into v_brand from public.organizations where id = c.brand_org_id;
  select name into v_broker from public.organizations where id = c.broker_org_id;
  if exists (select 1 from public.conversation_sides where conversation_id = c.id and org_id = v_to and muted) then return new; end if;

  insert into public.email_outbox (to_user_id, kind, payload, digest)
  select m.user_id, v_kind,
         jsonb_build_object('conversation_id', c.id, 'from_org', case when v_to = c.broker_org_id then v_brand else v_broker end,
                            'excerpt', left(new.body, 400), 'brief_title', c.brief_summary ->> 'title'),
         coalesce(p.email_new_message, 'instant') = 'daily'
    from public.org_members m
    left join public.notification_prefs p on p.user_id = m.user_id
   where m.org_id = v_to
     and coalesce(p.email_new_message, 'instant') <> 'off'
     and not public.email_opted_out(m.user_id, v_kind);
  return new;
end $$;
create trigger messages_email after insert on public.messages
  for each row execute function public.messages_enqueue_email();

-- Decline -> the brand team hears about it (not optional: it closes their thread).
create or replace function public.conversations_enqueue_decline()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.declined_at is null and new.declined_at is not null then
    insert into public.email_outbox (to_user_id, kind, payload)
    select m.user_id, 'broker_declined',
           jsonb_build_object('conversation_id', new.id, 'from_org', (select name from public.organizations where id = new.broker_org_id),
                              'reason', new.decline_reason, 'note', new.decline_note)
      from public.org_members m where m.org_id = new.brand_org_id and not public.email_opted_out(m.user_id, 'broker_declined');
  end if;
  return new;
end $$;
create trigger conversations_decline_email after update of declined_at on public.conversations
  for each row execute function public.conversations_enqueue_decline();

-- Admin notifications: listing submitted, verification requested, placement
-- requested, report filed. One row per active admin.
create or replace function public.enqueue_admin_email(p_kind text, p_payload jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.email_outbox (to_user_id, kind, payload)
  select id, p_kind, p_payload from public.users where is_admin and suspended_at is null;
$$;

create or replace function public.admin_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'placement_requests' then
    perform public.enqueue_admin_email('admin_placement_requested', jsonb_build_object('id', new.id,
      'brand', (select name from public.organizations where id = new.brand_org_id),
      'broker', (select o.name from public.broker_listings l join public.organizations o on o.id = l.org_id where l.id = new.listing_id),
      'note', new.note));
    -- and a receipt to the brand team
    insert into public.email_outbox (to_user_id, kind, payload)
    select m.user_id, 'placement_received', jsonb_build_object('broker', (select o.name from public.broker_listings l join public.organizations o on o.id = l.org_id where l.id = new.listing_id))
      from public.org_members m where m.org_id = new.brand_org_id;
  elsif tg_table_name = 'reports' then
    perform public.enqueue_admin_email('admin_report_filed', jsonb_build_object('id', new.id, 'reason', left(new.reason, 400)));
  elsif tg_table_name = 'verifications' and new.status = 'requested' then
    perform public.enqueue_admin_email('admin_verification_requested', jsonb_build_object('listing_id', new.listing_id,
      'broker', (select o.name from public.broker_listings l join public.organizations o on o.id = l.org_id where l.id = new.listing_id)));
  end if;
  return new;
end $$;
create trigger placement_requests_notify after insert on public.placement_requests for each row execute function public.admin_notify();
create trigger reports_notify after insert on public.reports for each row execute function public.admin_notify();
create trigger verifications_notify after insert on public.verifications for each row execute function public.admin_notify();

-- Listing lifecycle emails to the brokerage owners, and "submitted" to admins.
create or replace function public.listing_status_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_name text;
begin
  if new.status is not distinct from old.status and new.admin_paused is not distinct from old.admin_paused then return new; end if;
  select name into v_name from public.organizations where id = new.org_id;
  v_kind := case
    when new.status = 'submitted' and old.status = 'draft' then 'listing_submitted'
    when new.status = 'live' and old.status <> 'live' then 'listing_live'
    when new.status = 'paused' and old.status = 'live' then 'listing_paused'
    when new.admin_paused and not old.admin_paused then 'listing_paused'
    else null end;
  if v_kind is null then return new; end if;
  insert into public.email_outbox (to_user_id, kind, payload)
  select m.user_id, v_kind, jsonb_build_object('broker', v_name, 'by_admin', new.admin_paused and not old.admin_paused)
    from public.org_members m where m.org_id = new.org_id and m.role = 'owner';
  if v_kind = 'listing_submitted' then
    perform public.enqueue_admin_email('admin_listing_submitted', jsonb_build_object('broker', v_name, 'listing_id', new.id));
  end if;
  return new;
end $$;
create trigger broker_listings_notify after update of status, admin_paused on public.broker_listings
  for each row execute function public.listing_status_notify();

-- Verification decisions to the brokerage owners.
create or replace function public.verification_decision_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('verified', 'rejected', 'revoked') and old.status is distinct from new.status then
    insert into public.email_outbox (to_user_id, kind, payload)
    select m.user_id, 'verification_' || new.status::text, jsonb_build_object('reason', new.reason)
      from public.broker_listings l join public.org_members m on m.org_id = l.org_id and m.role = 'owner'
     where l.id = new.listing_id;
  end if;
  return new;
end $$;
create trigger verifications_decision_notify after update of status on public.verifications
  for each row execute function public.verification_decision_notify();

revoke execute on function public.start_conversation(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.start_conversation(uuid, text, uuid, jsonb) to authenticated;
revoke execute on function public.email_opted_out(uuid, text), public.enqueue_admin_email(text, jsonb) from public, anon, authenticated;
grant execute on function public.email_opted_out(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Supabase-only: attachment bucket + private realtime channels.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('message-files', 'message-files', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
    execute $p$drop policy if exists bench_msgfiles_read on storage.objects$p$;
    execute $p$create policy bench_msgfiles_read on storage.objects for select to authenticated
      using (bucket_id = 'message-files' and public.is_conversation_party(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$drop policy if exists bench_msgfiles_write on storage.objects$p$;
    execute $p$create policy bench_msgfiles_write on storage.objects for insert to authenticated
      with check (bucket_id = 'message-files' and public.is_conversation_party(((storage.foldername(name))[1])::uuid))$p$;
  end if;

  -- Typing indicators use private Broadcast channels named "conv:<id>";
  -- only the two parties may join.
  if exists (select 1 from pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    execute $p$drop policy if exists bench_conv_broadcast_read on realtime.messages$p$;
    execute $p$create policy bench_conv_broadcast_read on realtime.messages for select to authenticated
      using (realtime.topic() like 'conv:%' and public.is_conversation_party(substr(realtime.topic(), 6)::uuid))$p$;
    execute $p$drop policy if exists bench_conv_broadcast_write on realtime.messages$p$;
    execute $p$create policy bench_conv_broadcast_write on realtime.messages for insert to authenticated
      with check (realtime.topic() like 'conv:%' and public.is_conversation_party(substr(realtime.topic(), 6)::uuid))$p$;
  end if;
end $$;
