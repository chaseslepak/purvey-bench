-- Purvey Bench: RPC functions. Every function here is SECURITY DEFINER,
-- validates the caller itself, and is granted explicitly at the bottom.

-- ---------------------------------------------------------------------------
-- Utilities
-- ---------------------------------------------------------------------------
create or replace function public.slugify(p_text text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(p_text), '[^a-z0-9]+', '-', 'g')), ''), 'org');
$$;

create or replace function public.unique_org_slug(p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare base text := left(public.slugify(p_name), 60); candidate text := base; n int := 1;
begin
  while exists (select 1 from public.organizations where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end $$;

create or replace function public.write_audit(p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_user_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'));
$$;

create or replace function public.require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Organizations and teammates
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(
  p_type public.org_type,
  p_name text,
  p_website text default null,
  p_hq_city text default null,
  p_hq_state text default null,
  p_user_name text default null
) returns public.organizations
language plpgsql security definer set search_path = '' as $$
declare v_org public.organizations; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in required' using errcode = '42501'; end if;
  if exists (select 1 from public.org_members where user_id = v_uid) then
    raise exception 'you already belong to an organization' using errcode = '23505';
  end if;
  if exists (select 1 from public.users where id = v_uid and suspended_at is not null) then
    raise exception 'account suspended' using errcode = '42501';
  end if;
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'organization name required' using errcode = '23514';
  end if;

  update public.users
     set role = p_type,
         name = coalesce(nullif(trim(p_user_name), ''), name)
   where id = v_uid;

  insert into public.organizations (type, name, slug, website, hq_city, hq_state, created_by)
  values (p_type, trim(p_name), public.unique_org_slug(p_name), nullif(trim(p_website), ''),
          nullif(trim(p_hq_city), ''), nullif(upper(trim(p_hq_state)), ''), v_uid)
  returning * into v_org;

  insert into public.org_members (org_id, user_id, role) values (v_org.id, v_uid, 'owner');

  if p_type = 'broker' then
    insert into public.broker_listings (org_id) values (v_org.id);
    insert into public.broker_contacts (listing_id)
      select id from public.broker_listings where org_id = v_org.id;
  else
    insert into public.brand_profiles (org_id) values (v_org.id);
  end if;

  insert into public.product_events (name, user_id, org_id, props)
  values ('org_created', v_uid, v_org.id, jsonb_build_object('type', p_type));
  return v_org;
end $$;

-- Returns the plain token once; only its hash is stored.
create or replace function public.create_invite(p_email text, p_role public.member_role default 'member')
returns text language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.my_org_id(); v_token text;
begin
  if v_org is null or not public.is_org_owner(v_org) then
    raise exception 'only owners can invite teammates' using errcode = '42501';
  end if;
  if exists (select 1 from public.org_members m join public.users u on u.id = m.user_id
             where m.org_id = v_org and lower(u.email) = lower(trim(p_email))) then
    raise exception 'already a teammate' using errcode = '23505';
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.org_invites (org_id, email, role, token_hash, invited_by)
  values (v_org, lower(trim(p_email)), p_role, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), auth.uid());
  return v_token;
end $$;

create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.org_invites; v_uid uuid := auth.uid(); v_email text; v_type public.org_type; v_role public.org_type;
begin
  if v_uid is null then raise exception 'sign in required' using errcode = '42501'; end if;
  select * into v_inv from public.org_invites
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and accepted_at is null and expires_at > now()
   for update;
  if not found then raise exception 'invite is invalid or expired' using errcode = '22023'; end if;

  select email, role into v_email, v_role from public.users where id = v_uid;
  if lower(v_email) <> v_inv.email then
    raise exception 'this invite was sent to a different email address' using errcode = '42501';
  end if;
  if exists (select 1 from public.org_members where user_id = v_uid) then
    raise exception 'you already belong to an organization' using errcode = '23505';
  end if;
  select type into v_type from public.organizations where id = v_inv.org_id;
  if v_role is not null and v_role <> v_type then
    raise exception 'this invite is for a % organization', v_type using errcode = '23514';
  end if;

  update public.users set role = v_type where id = v_uid;
  insert into public.org_members (org_id, user_id, role, invited_by)
  values (v_inv.org_id, v_uid, v_inv.role, v_inv.invited_by);
  update public.org_invites set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  return v_inv.org_id;
end $$;

create or replace function public.revoke_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.org_invites
   where id = p_invite and accepted_at is null and public.is_org_owner(org_id);
  if not found then raise exception 'invite not found' using errcode = '42501'; end if;
end $$;

create or replace function public.remove_member(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.my_org_id();
begin
  -- Owners remove anyone; members may remove themselves (leave).
  if p_user <> auth.uid() and not public.is_org_owner(v_org) then
    raise exception 'only owners can remove teammates' using errcode = '42501';
  end if;
  delete from public.org_members where org_id = v_org and user_id = p_user;
  if not found then raise exception 'not a teammate' using errcode = '22023'; end if;
end $$;

create or replace function public.set_member_role(p_user uuid, p_role public.member_role)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.my_org_id();
begin
  if not public.is_org_owner(v_org) then
    raise exception 'only owners can change roles' using errcode = '42501';
  end if;
  update public.org_members set role = p_role where org_id = v_org and user_id = p_user;
  if not found then raise exception 'not a teammate' using errcode = '22023'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Listing lifecycle and billing
-- ---------------------------------------------------------------------------

-- Recompute live/paused from the subscription. Draft listings stay draft.
-- Live when: comped, or Stripe status active/trialing, or past_due for less
-- than 7 days (grace), or canceled but still inside the paid period.
create or replace function public.sync_listing_status(p_org uuid)
returns public.listing_status language plpgsql security definer set search_path = '' as $$
declare l public.broker_listings; s public.subscriptions; v_live boolean; v_new public.listing_status;
begin
  select * into l from public.broker_listings where org_id = p_org for update;
  if not found then return null; end if;
  if l.status = 'draft' then return 'draft'; end if;

  select * into s from public.subscriptions where org_id = p_org;
  v_live := coalesce(s.comped, false)
    or s.status in ('active', 'trialing')
    or (s.status = 'past_due' and s.past_due_since is not null and s.past_due_since > now() - interval '7 days')
    or (s.status = 'canceled' and s.current_period_end is not null and s.current_period_end > now())
    or (s.cancel_at_period_end and s.current_period_end > now() and s.status not in ('unpaid', 'incomplete_expired'));
  -- Not live: a listing that has never been live is still waiting on
  -- checkout ('submitted'); one that has been live is paused for billing.
  v_new := case when coalesce(v_live, false) then 'live'
                when l.live_since is null then 'submitted'
                else 'paused' end;

  if v_new <> l.status then
    update public.broker_listings
       set status = v_new,
           live_since = case when v_new = 'live' then now() else live_since end
     where id = l.id;
  end if;
  return v_new;
end $$;

-- Hourly cron entry point: re-evaluates every non-draft listing so grace
-- periods and period ends take effect without a webhook.
create or replace function public.sync_all_listing_statuses()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_before public.listing_status; v_after public.listing_status;
begin
  for r in select org_id, status from public.broker_listings where status <> 'draft' loop
    v_before := r.status;
    v_after := public.sync_listing_status(r.org_id);
    if v_after is distinct from v_before then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function public.submit_listing()
returns public.broker_listings language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.my_org_id(); l public.broker_listings; c public.broker_contacts;
begin
  if v_org is null or public.my_org_type() <> 'broker' then
    raise exception 'only brokerages can submit a listing' using errcode = '42501';
  end if;
  select * into l from public.broker_listings where org_id = v_org for update;
  select * into c from public.broker_contacts where listing_id = l.id;
  if (select count(*) from public.broker_retailers where listing_id = l.id) < 3 then
    raise exception 'add at least three retailers before submitting' using errcode = '23514';
  end if;
  if not exists (select 1 from public.broker_states where listing_id = l.id) then
    raise exception 'add the states you cover before submitting' using errcode = '23514';
  end if;
  if l.about is null or c.name is null or c.email is null then
    raise exception 'add your company description and a public contact before submitting' using errcode = '23514';
  end if;
  if l.status = 'draft' then
    update public.broker_listings set status = 'submitted', submitted_at = now() where id = l.id returning * into l;
  end if;
  perform public.sync_listing_status(v_org);
  select * into l from public.broker_listings where id = l.id;
  return l;
end $$;

-- 'draft' | 'submitted' | 'live' | 'paused_billing' | 'paused_admin'
create or replace function public.listing_display_state(p_listing uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when not (public.is_broker_member_of_listing(l.id) or public.is_admin()) then null
    when l.admin_paused then 'paused_admin'
    when l.status = 'paused' then 'paused_billing'
    else l.status::text end
  from public.broker_listings l where l.id = p_listing;
$$;

create or replace function public.admin_set_comp(p_org uuid, p_comped boolean)
returns public.listing_status language plpgsql security definer set search_path = '' as $$
declare v public.listing_status;
begin
  perform public.require_admin();
  perform public.assert_org_type(p_org, 'broker');
  insert into public.subscriptions (org_id, comped) values (p_org, p_comped)
  on conflict (org_id) do update set comped = excluded.comped, updated_at = now();
  -- A comped listing goes live without Stripe, as long as it has been submitted.
  update public.broker_listings set status = 'submitted', submitted_at = coalesce(submitted_at, now())
   where org_id = p_org and status = 'draft' and p_comped;
  v := public.sync_listing_status(p_org);
  perform public.write_audit(case when p_comped then 'listing.comp' else 'listing.uncomp' end, 'organization', p_org::text);
  return v;
end $$;

create or replace function public.admin_pause_listing(p_listing uuid, p_paused boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  update public.broker_listings
     set admin_paused = p_paused, admin_pause_reason = case when p_paused then p_reason end
   where id = p_listing;
  if not found then raise exception 'listing not found' using errcode = '22023'; end if;
  perform public.write_audit(case when p_paused then 'listing.pause' else 'listing.unpause' end,
    'listing', p_listing::text, jsonb_build_object('reason', p_reason));
end $$;

-- ---------------------------------------------------------------------------
-- Verification (brokers request; only Purvey admins decide)
-- ---------------------------------------------------------------------------
create or replace function public.request_verification()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.my_org_id(); l public.broker_listings; v_id uuid;
begin
  if v_org is null or not public.is_org_owner(v_org) or public.my_org_type() <> 'broker' then
    raise exception 'only brokerage owners can request verification' using errcode = '42501';
  end if;
  select * into l from public.broker_listings where org_id = v_org;
  if l.completeness < 80 then
    raise exception 'profile strength must be at least 80%% to request verification' using errcode = '23514';
  end if;
  if l.verified_at is not null then
    raise exception 'already verified' using errcode = '23505';
  end if;
  insert into public.verifications (listing_id, status, requested_by) values (l.id, 'requested', auth.uid())
  returning id into v_id;
  insert into public.verification_reviews (verification_id) values (v_id);
  return v_id;
end $$;

create or replace function public.admin_update_verification_review(
  p_verification uuid, p_references_reached boolean, p_retailers_confirmed boolean, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  insert into public.verification_reviews (verification_id, references_reached, retailers_confirmed, notes, updated_by)
  values (p_verification, p_references_reached, p_retailers_confirmed, p_notes, auth.uid())
  on conflict (verification_id) do update set
    references_reached = excluded.references_reached, retailers_confirmed = excluded.retailers_confirmed,
    notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now();
end $$;

create or replace function public.admin_decide_verification(
  p_verification uuid, p_status public.verification_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.verifications; r public.verification_reviews;
begin
  perform public.require_admin();
  if p_status not in ('verified', 'rejected', 'revoked') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  select * into v from public.verifications where id = p_verification for update;
  if not found then raise exception 'verification not found' using errcode = '22023'; end if;
  select * into r from public.verification_reviews where verification_id = v.id;
  if p_status = 'verified' and not (coalesce(r.references_reached, false) and coalesce(r.retailers_confirmed, false)) then
    raise exception 'complete the checklist before verifying' using errcode = '23514';
  end if;
  if p_status in ('rejected', 'revoked') and (p_reason is null or char_length(trim(p_reason)) = 0) then
    raise exception 'a reason is required' using errcode = '23514';
  end if;
  update public.verifications set status = p_status, reason = p_reason, checked_by = auth.uid(), decided_at = now()
   where id = v.id;
  update public.broker_listings set verified_at = case when p_status = 'verified' then now() else null end
   where id = v.listing_id;
  perform public.write_audit('verification.' || p_status::text, 'listing', v.listing_id::text,
    jsonb_build_object('verification_id', v.id, 'reason', p_reason));
end $$;

-- ---------------------------------------------------------------------------
-- Brand actions
-- ---------------------------------------------------------------------------

-- Contact details for a live listing. Brands only; each brand's first reveal
-- of a listing is logged; at most 50 new reveals per brand per day.
create or replace function public.reveal_contact(p_listing uuid)
returns table (name text, title text, email text, phone text)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.my_org_id(); v_count int;
begin
  if v_org is null or public.my_org_type() <> 'brand' then
    raise exception 'a free brand account is required to see contact details' using errcode = '42501';
  end if;
  if not public.listing_is_visible(p_listing) then
    raise exception 'listing not available' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profile_events
                 where listing_id = p_listing and brand_org_id = v_org and type = 'contact_reveal') then
    select count(*) into v_count from public.profile_events
     where brand_org_id = v_org and type = 'contact_reveal' and created_at > now() - interval '24 hours';
    if v_count >= 50 then
      raise exception 'daily limit of 50 contact reveals reached' using errcode = 'P0001', hint = 'rate_limited';
    end if;
    insert into public.profile_events (listing_id, type, brand_org_id, user_id)
    values (p_listing, 'contact_reveal', v_org, auth.uid());
  end if;
  return query select c.name, c.title, c.email, c.phone from public.broker_contacts c where c.listing_id = p_listing;
end $$;

-- Search impressions and profile views (anyone; brand id recorded if signed in as a brand).
create or replace function public.log_profile_events(p_listings uuid[], p_type public.profile_event_type)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if p_type not in ('search_impression', 'profile_view') then
    raise exception 'event type not allowed' using errcode = '22023';
  end if;
  if cardinality(p_listings) > 48 then
    raise exception 'too many listings' using errcode = '22023';
  end if;
  if public.my_org_type() = 'brand' then v_org := public.my_org_id(); end if;
  insert into public.profile_events (listing_id, type, brand_org_id, user_id)
  select l.id, p_type, v_org, auth.uid()
    from public.broker_listings l
   where l.id = any(p_listings) and public.listing_is_visible(l.id)
     and not public.is_org_member(l.org_id);   -- brokers viewing themselves don't count
end $$;

-- Aggregate analytics for the caller's own listing. Never returns brand ids.
create or replace function public.listing_analytics(p_days int default 30)
returns table (day date, type public.profile_event_type, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_listing uuid;
begin
  select l.id into v_listing from public.broker_listings l where l.org_id = public.my_org_id();
  if v_listing is null then raise exception 'no listing' using errcode = '42501'; end if;
  return query
    select (e.created_at at time zone 'utc')::date, e.type, count(*)
      from public.profile_events e
     where e.listing_id = v_listing and e.created_at > now() - make_interval(days => least(greatest(p_days, 1), 365))
     group by 1, 2
    union all
    select (c.created_at at time zone 'utc')::date, 'message'::public.profile_event_type, count(*)
      from public.conversations c
     where c.broker_org_id = public.my_org_id()
       and c.created_at > now() - make_interval(days => least(greatest(p_days, 1), 365))
     group by 1
    order by 1;
end $$;

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create or replace function public.decline_conversation(p_conv uuid, p_reason public.decline_reason, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.conversations;
begin
  select * into c from public.conversations where id = p_conv for update;
  if not found or not public.is_org_member(c.broker_org_id) then
    raise exception 'only the broker in this conversation can decline it' using errcode = '42501';
  end if;
  if c.declined_at is not null then return; end if;
  update public.conversations
     set declined_at = now(), decline_reason = p_reason, decline_note = nullif(left(trim(p_note), 1000), '')
   where id = p_conv;
  update public.conversation_sides set broker_stage = 'declined', archived = true
   where conversation_id = p_conv and org_id = c.broker_org_id;
end $$;

create or replace function public.mark_conversation_read(p_conv uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.my_org_id();
begin
  if not public.is_conversation_party(p_conv) then
    raise exception 'not your conversation' using errcode = '42501';
  end if;
  update public.messages set read_at = now()
   where conversation_id = p_conv and sender_org_id <> v_org and read_at is null;
  update public.conversation_sides set last_read_at = now(), marked_unread = false
   where conversation_id = p_conv and org_id = v_org;
end $$;

-- Admins may read a thread only after it has been reported. Every read is audited.
create or replace function public.admin_read_thread(p_conv uuid)
returns setof public.messages language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  if not exists (select 1 from public.conversations where id = p_conv and reported_at is not null) then
    raise exception 'admins can only read reported conversations' using errcode = '42501';
  end if;
  perform public.write_audit('conversation.admin_read', 'conversation', p_conv::text);
  return query select * from public.messages where conversation_id = p_conv order by created_at;
end $$;

-- Reporting a conversation flags it for admin review.
create or replace function public.reports_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.conversation_id is not null then
    update public.conversations set reported_at = coalesce(reported_at, now()) where id = new.conversation_id;
  end if;
  return new;
end $$;
create trigger reports_flag after insert on public.reports
  for each row execute function public.reports_after_insert();

-- ---------------------------------------------------------------------------
-- Admin: suspend, merge reference lists
-- ---------------------------------------------------------------------------
create or replace function public.admin_suspend_org(p_org uuid, p_suspended boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  update public.organizations set suspended_at = case when p_suspended then now() end where id = p_org;
  perform public.write_audit(case when p_suspended then 'org.suspend' else 'org.unsuspend' end, 'organization', p_org::text);
end $$;

create or replace function public.admin_merge_reference(p_table text, p_from integer, p_into integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  if p_table not in ('retailers', 'categories', 'channels', 'distributors') then
    raise exception 'unknown list' using errcode = '22023';
  end if;
  if p_from = p_into then raise exception 'cannot merge into itself' using errcode = '22023'; end if;

  if p_table = 'retailers' then
    -- Keep the more frequent call if a broker had both.
    delete from public.broker_retailers a using public.broker_retailers b
     where a.retailer_id = p_from and b.retailer_id = p_into and a.listing_id = b.listing_id;
    update public.broker_retailers set retailer_id = p_into where retailer_id = p_from;
    update public.briefs set target_retailers = array(select distinct unnest(array_replace(target_retailers, p_from, p_into)))
     where p_from = any(target_retailers);
    update public.brand_profiles set current_retailers = array(select distinct unnest(array_replace(current_retailers, p_from, p_into)))
     where p_from = any(current_retailers);
  elsif p_table = 'categories' then
    update public.broker_listings set
      categories = array(select distinct unnest(array_replace(categories, p_from, p_into))),
      conflicts = array(select distinct unnest(array_replace(conflicts, p_from, p_into)))
     where p_from = any(categories) or p_from = any(conflicts);
    update public.briefs set category_id = p_into where category_id = p_from;
    update public.brand_profiles set categories = array(select distinct unnest(array_replace(categories, p_from, p_into)))
     where p_from = any(categories);
  elsif p_table = 'channels' then
    update public.broker_listings set channels = array(select distinct unnest(array_replace(channels, p_from, p_into)))
     where p_from = any(channels);
    update public.briefs set channels = array(select distinct unnest(array_replace(channels, p_from, p_into)))
     where p_from = any(channels);
  else
    update public.broker_listings set distributors = array(select distinct unnest(array_replace(distributors, p_from, p_into)))
     where p_from = any(distributors);
    update public.briefs set distributors = array(select distinct unnest(array_replace(distributors, p_from, p_into)))
     where p_from = any(distributors);
    update public.brand_profiles set current_distributors = array(select distinct unnest(array_replace(current_distributors, p_from, p_into)))
     where p_from = any(current_distributors);
  end if;
  execute format('update public.%I set active = false, merged_into = $1 where id = $2', p_table) using p_into, p_from;
  perform public.write_audit('reference.merge', p_table, p_from::text, jsonb_build_object('into', p_into));
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;

-- Utilities and internal helpers are not callable by clients.
revoke execute on function public.slugify(text), public.unique_org_slug(text),
  public.write_audit(text, text, text, jsonb), public.require_admin(),
  public.sync_listing_status(uuid), public.sync_all_listing_statuses()
  from authenticated;

grant execute on function
  public.create_organization(public.org_type, text, text, text, text, text),
  public.create_invite(text, public.member_role),
  public.accept_invite(text),
  public.revoke_invite(uuid),
  public.remove_member(uuid),
  public.set_member_role(uuid, public.member_role),
  public.submit_listing(),
  public.listing_display_state(uuid),
  public.request_verification(),
  public.reveal_contact(uuid),
  public.listing_analytics(int),
  public.decline_conversation(uuid, public.decline_reason, text),
  public.mark_conversation_read(uuid),
  -- Admin RPCs check is_admin() themselves.
  public.admin_set_comp(uuid, boolean),
  public.admin_pause_listing(uuid, boolean, text),
  public.admin_update_verification_review(uuid, boolean, boolean, text),
  public.admin_decide_verification(uuid, public.verification_status, text),
  public.admin_read_thread(uuid),
  public.admin_suspend_org(uuid, boolean),
  public.admin_merge_reference(text, integer, integer)
  to authenticated;

grant execute on function public.log_profile_events(uuid[], public.profile_event_type) to anon, authenticated;

-- Server-only (webhooks, cron) via the service role.
grant execute on function public.sync_listing_status(uuid), public.sync_all_listing_statuses() to service_role;

-- Policies call these as anon/authenticated (re-granted after the blanket revoke above).
grant execute on function
  public.is_admin(), public.my_org_id(), public.my_org_type(), public.is_org_member(uuid),
  public.is_org_owner(uuid), public.is_brand_member_of(uuid), public.is_broker_member_of_listing(uuid),
  public.listing_is_visible(uuid), public.org_listing_is_visible(uuid),
  public.is_conversation_party(uuid), public.shares_conversation_with(uuid)
  to anon, authenticated, service_role;
