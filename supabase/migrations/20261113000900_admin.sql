-- Phase 5: admin console support.

-- Aggregates for the overview. Admins can't browse conversations, so counts
-- come from here.
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'live_listings', (select count(*) from public.broker_listings where status = 'live' and not admin_paused),
    'paying_listings', (select count(*) from public.subscriptions s join public.broker_listings l on l.org_id = s.org_id where s.status in ('active', 'trialing', 'past_due') and not s.comped),
    'comped_listings', (select count(*) from public.subscriptions where comped),
    'new_listings_week', (select count(*) from public.broker_listings where live_since > now() - interval '7 days'),
    'past_due', (select count(*) from public.subscriptions where status = 'past_due'),
    'churned_month', (select count(*) from public.subscriptions where status = 'canceled' and updated_at >= date_trunc('month', now())),
    'drafts', (select count(*) from public.broker_listings where status = 'draft'),
    'brands', (select count(*) from public.organizations where type = 'brand'),
    'brands_week', (select count(*) from public.organizations where type = 'brand' and created_at > now() - interval '7 days'),
    'conversations', (select count(*) from public.conversations),
    'conversations_month', (select count(*) from public.conversations where created_at >= date_trunc('month', now())),
    'reply_rate', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where exists (
        select 1 from public.messages m where m.conversation_id = c.id and m.sender_org_id = c.broker_org_id and not m.is_auto_reply)) / count(*)) end
      from public.conversations c),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'verifications_waiting', (select count(*) from public.verifications where status = 'requested'),
    'placements_new', (select count(*) from public.placement_requests where status = 'new'),
    'audits_new', (select count(*) from public.audit_requests where status = 'new')
  );
end $$;

-- Generic audit entry for admin actions that don't log themselves.
create or replace function public.admin_log(p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  perform public.write_audit(left(p_action, 80), left(p_target_type, 40), left(p_target_id, 80), coalesce(p_details, '{}'));
end $$;

-- Commission audits are a Purvey service (rule 8): the app only collects requests.
create table public.audit_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  requester_org_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid references public.users(id) on delete set null,
  note text check (note is null or char_length(note) <= 4000),
  status public.placement_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.audit_requests enable row level security;
revoke all on public.audit_requests from anon, authenticated;
grant select on public.audit_requests to authenticated;
grant update (status) on public.audit_requests to authenticated;
create policy audit_requests_read on public.audit_requests for select to authenticated
  using (public.is_org_member(requester_org_id) or public.is_admin());
create policy audit_requests_admin_update on public.audit_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create trigger audit_requests_touch before update on public.audit_requests for each row execute function public.touch_updated_at();

create or replace function public.request_commission_audit(p_conv uuid, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_conversation_party(p_conv) then raise exception 'not your conversation' using errcode = '42501'; end if;
  insert into public.audit_requests (conversation_id, requester_org_id, requested_by, note)
  values (p_conv, public.my_org_id(), auth.uid(), nullif(left(trim(p_note), 4000), '')) returning id into v_id;
  perform public.enqueue_admin_email('admin_audit_requested', jsonb_build_object('id', v_id,
    'brand', (select o.name from public.conversations c join public.organizations o on o.id = c.brand_org_id where c.id = p_conv),
    'broker', (select o.name from public.conversations c join public.organizations o on o.id = c.broker_org_id where c.id = p_conv),
    'note', p_note));
  return v_id;
end $$;

-- Admin view of one conversation's commission records (audit work), logged.
create or replace function public.admin_read_true_up(p_conv uuid)
returns setof public.commission_periods language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  if not exists (select 1 from public.audit_requests where conversation_id = p_conv) then
    raise exception 'admins can only read commission records after an audit is requested' using errcode = '42501';
  end if;
  perform public.write_audit('true_up.admin_read', 'conversation', p_conv::text);
  return query select * from public.commission_periods where conversation_id = p_conv order by period;
end $$;

revoke execute on function public.admin_stats(), public.admin_log(text, text, text, jsonb), public.request_commission_audit(uuid, text),
  public.admin_read_true_up(uuid) from public, anon;
grant execute on function public.admin_stats(), public.admin_log(text, text, text, jsonb), public.request_commission_audit(uuid, text),
  public.admin_read_true_up(uuid) to authenticated;

-- References are admin-only working data: record what Purvey heard back.
create or replace function public.admin_update_reference(p_ref uuid, p_status public.reference_status, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  update public.broker_references set status = p_status, admin_notes = nullif(left(trim(p_notes), 4000), '') where id = p_ref;
  if not found then raise exception 'reference not found' using errcode = '22023'; end if;
  perform public.write_audit('reference_check.update', 'broker_reference', p_ref::text, jsonb_build_object('status', p_status));
end $$;

-- Resolve a report, optionally acting on the reported organization:
--   warn    email the reported org's owners (not unsubscribable)
--   block   the reporter's org blocks the reported org (conversation reports)
--   pause   pause the reported broker's listing
--   suspend suspend the reported org
create or replace function public.admin_resolve_report(p_report uuid, p_status public.report_status, p_resolution text, p_action text default 'none', p_message text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reports; v_target uuid; v_listing uuid;
begin
  perform public.require_admin();
  if p_status not in ('resolved', 'dismissed') then raise exception 'invalid status' using errcode = '22023'; end if;
  if p_action not in ('none', 'warn', 'block', 'pause', 'suspend') then raise exception 'invalid action' using errcode = '22023'; end if;
  select * into r from public.reports where id = p_report for update;
  if not found then raise exception 'report not found' using errcode = '22023'; end if;

  if r.conversation_id is not null then
    select case when c.brand_org_id = r.reporter_org_id then c.broker_org_id else c.brand_org_id end into v_target
      from public.conversations c where c.id = r.conversation_id;
  else
    select org_id into v_target from public.broker_listings where id = r.listing_id;
  end if;

  if p_action = 'warn' then
    if p_message is null or char_length(trim(p_message)) = 0 then raise exception 'write the warning' using errcode = '23514'; end if;
    insert into public.email_outbox (to_user_id, kind, payload)
    select m.user_id, 'admin_warning', jsonb_build_object('message', left(p_message, 2000))
      from public.org_members m where m.org_id = v_target and m.role = 'owner';
  elsif p_action = 'block' then
    if r.conversation_id is null or r.reporter_org_id is null then raise exception 'block applies to conversation reports' using errcode = '22023'; end if;
    insert into public.org_blocks (blocker_org_id, blocked_org_id, created_by) values (r.reporter_org_id, v_target, auth.uid())
    on conflict do nothing;
  elsif p_action = 'pause' then
    select id into v_listing from public.broker_listings where org_id = v_target;
    if v_listing is null then raise exception 'the reported organization has no listing' using errcode = '22023'; end if;
    perform public.admin_pause_listing(v_listing, true, coalesce(p_message, 'Paused after a report'));
  elsif p_action = 'suspend' then
    perform public.admin_suspend_org(v_target, true);
  end if;

  update public.reports set status = p_status, resolution = nullif(left(trim(p_resolution), 2000), ''), resolved_at = now() where id = r.id;
  perform public.write_audit('report.' || p_status::text, 'report', r.id::text,
    jsonb_build_object('action', p_action, 'target_org', v_target, 'resolution', p_resolution));
end $$;

revoke execute on function public.admin_update_reference(uuid, public.reference_status, text),
  public.admin_resolve_report(uuid, public.report_status, text, text, text) from public, anon;
grant execute on function public.admin_update_reference(uuid, public.reference_status, text),
  public.admin_resolve_report(uuid, public.report_status, text, text, text) to authenticated;
