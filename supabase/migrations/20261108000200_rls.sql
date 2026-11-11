-- Purvey Bench: helpers, integrity triggers, grants and row-level security.
--
-- Principles
--  * Deny by default: all table privileges are revoked from anon and
--    authenticated, then granted back table by table (and column by column
--    where a role may only touch some fields).
--  * RLS is enabled on every table. Tables with no policy for a role are
--    unreadable by that role.
--  * Business rules that must hold even for server code (e.g. only brand
--    members start conversations) are enforced by triggers, which also run
--    for the service role.

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select u.is_admin from public.users u where u.id = auth.uid() and u.suspended_at is null),
    false);
$$;

create or replace function public.my_org_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.org_id from public.org_members m where m.user_id = auth.uid();
$$;

-- Type of the caller's org, or null if the caller or the org is suspended.
create or replace function public.my_org_type()
returns public.org_type language sql stable security definer set search_path = '' as $$
  select o.type
  from public.org_members m
  join public.organizations o on o.id = m.org_id
  join public.users u on u.id = m.user_id
  where m.user_id = auth.uid() and o.suspended_at is null and u.suspended_at is null;
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    join public.users u on u.id = m.user_id
    where m.org_id = p_org and m.user_id = auth.uid() and u.suspended_at is null);
$$;

create or replace function public.is_org_owner(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    join public.users u on u.id = m.user_id
    where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'owner' and u.suspended_at is null);
$$;

create or replace function public.is_brand_member_of(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_org_member(p_org) and public.my_org_type() = 'brand'
     and (select o.type from public.organizations o where o.id = p_org) = 'brand';
$$;

create or replace function public.is_broker_member_of_listing(p_listing uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.broker_listings l
    where l.id = p_listing and public.is_org_member(l.org_id));
$$;

-- A listing is visible to brands only when live (subscription active, in
-- grace, or comped — see sync_listing_status), not paused by Purvey, and the
-- brokerage is not suspended.
create or replace function public.listing_is_visible(p_listing uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.broker_listings l
    join public.organizations o on o.id = l.org_id
    where l.id = p_listing and l.status = 'live' and not l.admin_paused and o.suspended_at is null);
$$;

create or replace function public.org_listing_is_visible(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.broker_listings l
    where l.org_id = p_org and public.listing_is_visible(l.id));
$$;

create or replace function public.is_conversation_party(p_conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conv
      and (public.is_org_member(c.brand_org_id) or public.is_org_member(c.broker_org_id)));
$$;

-- Two orgs share a conversation (lets a broker see the name of a brand that
-- messaged it, and nothing more).
create or replace function public.shares_conversation_with(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where (c.brand_org_id = p_org and public.is_org_member(c.broker_org_id))
       or (c.broker_org_id = p_org and public.is_org_member(c.brand_org_id)));
$$;

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();
create trigger brand_profiles_touch before update on public.brand_profiles
  for each row execute function public.touch_updated_at();
create trigger briefs_touch before update on public.briefs
  for each row execute function public.touch_updated_at();
create trigger broker_contacts_touch before update on public.broker_contacts
  for each row execute function public.touch_updated_at();
create trigger placement_requests_touch before update on public.placement_requests
  for each row execute function public.touch_updated_at();
create trigger notification_prefs_touch before update on public.notification_prefs
  for each row execute function public.touch_updated_at();

-- New auth user -> public.users profile + default notification prefs.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, nullif(left(new.raw_user_meta_data ->> 'name', 120), ''))
  on conflict (id) do nothing;
  insert into public.notification_prefs (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Keep users.email in step with auth.users.email.
create or replace function public.handle_auth_user_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.users set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_auth_user_email();

-- Org-type integrity: brand tables point at brand orgs, broker tables at broker orgs.
create or replace function public.assert_org_type(p_org uuid, p_type public.org_type)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.organizations where id = p_org and type = p_type) then
    raise exception 'organization % is not a % organization', p_org, p_type using errcode = '23514';
  end if;
end $$;

create or replace function public.check_brand_org()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- tg_argv[0] names the column holding the brand org id.
  perform public.assert_org_type((to_jsonb(new) ->> tg_argv[0])::uuid, 'brand');
  return new;
end $$;

create trigger brand_profiles_type before insert or update on public.brand_profiles
  for each row execute function public.check_brand_org('org_id');
create trigger briefs_type before insert or update on public.briefs
  for each row execute function public.check_brand_org('brand_org_id');
create trigger saved_brokers_type before insert or update on public.saved_brokers
  for each row execute function public.check_brand_org('brand_org_id');
create trigger placement_requests_type before insert or update on public.placement_requests
  for each row execute function public.check_brand_org('brand_org_id');

create or replace function public.check_broker_org()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.assert_org_type(new.org_id, 'broker');
  return new;
end $$;

create trigger broker_listings_type before insert or update of org_id on public.broker_listings
  for each row execute function public.check_broker_org();
create trigger subscriptions_type before insert or update of org_id on public.subscriptions
  for each row execute function public.check_broker_org();

-- Reference ids stored in integer arrays must exist.
create or replace function public.assert_ref_ids(p_ids integer[], p_table text)
returns void language plpgsql stable security definer set search_path = '' as $$
declare missing integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 then return; end if;
  execute format('select x from unnest($1) x where not exists (select 1 from public.%I t where t.id = x) limit 1', p_table)
    into missing using p_ids;
  if missing is not null then
    raise exception 'unknown % id %', p_table, missing using errcode = '23503';
  end if;
end $$;

create or replace function public.assert_state_codes(p_codes text[])
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from unnest(p_codes) x where not exists (select 1 from public.states s where s.code = x)) then
    raise exception 'unknown state code' using errcode = '23503';
  end if;
end $$;

create or replace function public.check_listing_refs()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.assert_ref_ids(new.channels, 'channels');
  perform public.assert_ref_ids(new.distributors, 'distributors');
  perform public.assert_ref_ids(new.categories, 'categories');
  perform public.assert_ref_ids(new.conflicts, 'categories');
  return new;
end $$;
create trigger broker_listings_refs before insert or update on public.broker_listings
  for each row execute function public.check_listing_refs();

create or replace function public.check_brief_refs()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.assert_ref_ids(new.channels, 'channels');
  perform public.assert_ref_ids(new.distributors, 'distributors');
  perform public.assert_ref_ids(new.target_retailers, 'retailers');
  perform public.assert_state_codes(new.states);
  if exists (select 1 from unnest(new.regions) r where not exists (select 1 from public.regions g where g.code = r)) then
    raise exception 'unknown region' using errcode = '23503';
  end if;
  return new;
end $$;
create trigger briefs_refs before insert or update on public.briefs
  for each row execute function public.check_brief_refs();

create or replace function public.check_brand_profile_refs()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.assert_ref_ids(new.categories, 'categories');
  perform public.assert_ref_ids(new.current_distributors, 'distributors');
  perform public.assert_ref_ids(new.current_retailers, 'retailers');
  return new;
end $$;
create trigger brand_profiles_refs before insert or update on public.brand_profiles
  for each row execute function public.check_brand_profile_refs();

-- An organization always keeps at least one owner.
create or replace function public.keep_one_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    if exists (select 1 from public.organizations where id = old.org_id) -- not an org delete cascade
       and not exists (select 1 from public.org_members
                       where org_id = old.org_id and role = 'owner' and user_id <> old.user_id) then
      raise exception 'an organization must keep at least one owner' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger org_members_keep_owner before update or delete on public.org_members
  for each row execute function public.keep_one_owner();

-- Members join an org of the same type as their user role.
create or replace function public.check_member_role_matches()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user_role public.org_type; v_org_type public.org_type;
begin
  select role into v_user_role from public.users where id = new.user_id;
  select type into v_org_type from public.organizations where id = new.org_id;
  if v_user_role is distinct from v_org_type then
    raise exception 'user role % does not match organization type %', v_user_role, v_org_type using errcode = '23514';
  end if;
  return new;
end $$;
create trigger org_members_role_match before insert or update on public.org_members
  for each row execute function public.check_member_role_matches();

-- audit_log is append-only for everyone, including the service role.
create or replace function public.audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end $$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

-- ---------------------------------------------------------------------------
-- Listing completeness (profile strength). Recomputed on every change to the
-- listing or its child rows; clients cannot write it.
-- Checklist (each item equal weight):
--   about, logo, website, HQ city+state, contact name+email, contact phone,
--   >=1 state, >=1 channel, >=1 distributor, >=3 retailers, >=1 category,
--   commission model + rate or retainer, min term, years in business,
--   team size, 2 references, a line card or capabilities document.
-- ---------------------------------------------------------------------------
create or replace function public.compute_completeness(l public.broker_listings)
returns smallint language plpgsql stable security definer set search_path = '' as $$
declare
  o public.organizations;
  c public.broker_contacts;
  checks boolean[];
  done int := 0;
  item boolean;
begin
  select * into o from public.organizations where id = l.org_id;
  select * into c from public.broker_contacts where listing_id = l.id;
  checks := array[
    coalesce(char_length(l.about) >= 40, false),
    o.logo_url is not null,
    o.website is not null,
    o.hq_city is not null and o.hq_state is not null,
    c.name is not null and c.email is not null,
    c.phone is not null,
    exists (select 1 from public.broker_states s where s.listing_id = l.id),
    cardinality(l.channels) > 0,
    cardinality(l.distributors) > 0,
    (select count(*) from public.broker_retailers r where r.listing_id = l.id) >= 3,
    cardinality(l.categories) > 0,
    l.commission_model is not null and (l.rate_low is not null or l.retainer is not null),
    l.min_term_months is not null,
    l.years_in_business is not null,
    l.team_size is not null,
    (select count(*) from public.broker_references r where r.listing_id = l.id) >= 2,
    exists (select 1 from public.listing_documents d where d.listing_id = l.id)
  ];
  foreach item in array checks loop
    if coalesce(item, false) then done := done + 1; end if;
  end loop;
  return round(100.0 * done / cardinality(checks));
end $$;

create or replace function public.set_listing_completeness()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.completeness := public.compute_completeness(new);
  new.updated_at := now();
  return new;
end $$;
create trigger broker_listings_completeness before insert or update on public.broker_listings
  for each row execute function public.set_listing_completeness();

-- Child-row changes bump the parent listing so its completeness recomputes.
create or replace function public.bump_listing()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.broker_listings set updated_at = now()
  where id = coalesce(new.listing_id, old.listing_id);
  return coalesce(new, old);
end $$;
create trigger broker_states_bump after insert or update or delete on public.broker_states
  for each row execute function public.bump_listing();
create trigger broker_retailers_bump after insert or update or delete on public.broker_retailers
  for each row execute function public.bump_listing();
create trigger broker_references_bump after insert or update or delete on public.broker_references
  for each row execute function public.bump_listing();
create trigger broker_contacts_bump after insert or update or delete on public.broker_contacts
  for each row execute function public.bump_listing();
create trigger listing_documents_bump after insert or update or delete on public.listing_documents
  for each row execute function public.bump_listing();

create or replace function public.bump_org_listing()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.type = 'broker' then
    update public.broker_listings set updated_at = now() where org_id = new.id;
  end if;
  return new;
end $$;
create trigger organizations_bump_listing after update of logo_url, website, hq_city, hq_state on public.organizations
  for each row execute function public.bump_org_listing();

-- ---------------------------------------------------------------------------
-- Conversation rules (enforced for every role, including service_role)
-- ---------------------------------------------------------------------------
create or replace function public.conversations_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_brief public.briefs;
  v_today_count int;
begin
  -- 1. Only a member of a brand organization may start a conversation, and
  --    only on behalf of that brand.
  if not exists (
    select 1 from public.org_members m
    join public.organizations o on o.id = m.org_id
    join public.users u on u.id = m.user_id
    where m.user_id = new.started_by and m.org_id = new.brand_org_id
      and o.type = 'brand' and o.suspended_at is null and u.suspended_at is null
  ) then
    raise exception 'only members of a brand organization can start a conversation' using errcode = '42501';
  end if;

  -- 2. The other party must be a broker with a visible listing.
  if not exists (select 1 from public.organizations where id = new.broker_org_id and type = 'broker') then
    raise exception 'conversations can only be started with a brokerage' using errcode = '42501';
  end if;
  if not public.org_listing_is_visible(new.broker_org_id) then
    raise exception 'this listing is not available' using errcode = '42501';
  end if;

  -- 3. Blocks.
  if exists (select 1 from public.org_blocks
             where (blocker_org_id = new.broker_org_id and blocked_org_id = new.brand_org_id)
                or (blocker_org_id = new.brand_org_id and blocked_org_id = new.broker_org_id)) then
    raise exception 'messaging between these organizations is blocked' using errcode = '42501';
  end if;

  -- 4. At most 25 new conversations per brand per day.
  select count(*) into v_today_count from public.conversations
  where brand_org_id = new.brand_org_id and created_at > now() - interval '24 hours';
  if v_today_count >= 25 then
    raise exception 'daily limit of 25 new conversations reached' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  -- 5. The brief summary is always built here from the brand's own brief, so
  --    a client cannot inject arbitrary content or someone else's brief.
  new.brief_summary := null;
  if new.brief_id is not null then
    select * into v_brief from public.briefs where id = new.brief_id and brand_org_id = new.brand_org_id;
    if not found then
      raise exception 'brief not found' using errcode = '42501';
    end if;
    new.brief_summary := jsonb_build_object(
      'title', v_brief.title,
      'category', (select name from public.categories where id = v_brief.category_id),
      'regions', v_brief.regions,
      'states', v_brief.states,
      'channels', (select coalesce(jsonb_agg(name order by name), '[]') from public.channels where id = any(v_brief.channels)),
      'target_retailers', (select coalesce(jsonb_agg(name order by name), '[]') from public.retailers where id = any(v_brief.target_retailers)),
      'distributors', (select coalesce(jsonb_agg(name order by name), '[]') from public.distributors where id = any(v_brief.distributors)),
      'notes', v_brief.notes
    );
  end if;

  new.declined_at := null;
  new.decline_reason := null;
  new.decline_note := null;
  new.reported_at := null;
  new.created_at := now();
  new.last_message_at := now();
  return new;
end $$;
create trigger conversations_rules before insert on public.conversations
  for each row execute function public.conversations_before_insert();

create or replace function public.conversations_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.conversation_sides (conversation_id, org_id, brand_stage, last_read_at)
  values (new.id, new.brand_org_id, 'contacted', now());
  insert into public.conversation_sides (conversation_id, org_id, broker_stage)
  values (new.id, new.broker_org_id, 'new');
  return new;
end $$;
create trigger conversations_sides after insert on public.conversations
  for each row execute function public.conversations_after_insert();

-- A side may only set its own kind of stage and assign its own teammates.
create or replace function public.conversation_sides_check()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_type public.org_type;
begin
  if new.conversation_id <> old.conversation_id or new.org_id <> old.org_id then
    raise exception 'cannot move a conversation side' using errcode = '42501';
  end if;
  select type into v_type from public.organizations where id = new.org_id;
  if (v_type = 'brand' and new.broker_stage is not null) or (v_type = 'broker' and new.brand_stage is not null) then
    raise exception 'stage does not match organization type' using errcode = '23514';
  end if;
  if new.assignee_user_id is not null
     and not exists (select 1 from public.org_members where org_id = new.org_id and user_id = new.assignee_user_id) then
    raise exception 'assignee must be a teammate' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger conversation_sides_rules before update on public.conversation_sides
  for each row execute function public.conversation_sides_check();

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
  new.created_at := now();
  return new;
end $$;
create trigger messages_rules before insert on public.messages
  for each row execute function public.messages_before_insert();

create or replace function public.messages_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.conversations;
begin
  select * into c from public.conversations where id = new.conversation_id;
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  -- Sender has read up to now; the recipient's thread un-archives.
  update public.conversation_sides set last_read_at = new.created_at, marked_unread = false
    where conversation_id = new.conversation_id and org_id = new.sender_org_id;
  update public.conversation_sides set archived = false
    where conversation_id = new.conversation_id and org_id <> new.sender_org_id;
  -- First broker reply moves the broker's own stage from New to Replied.
  if new.sender_org_id = c.broker_org_id and not new.is_auto_reply then
    update public.conversation_sides set broker_stage = 'replied'
      where conversation_id = new.conversation_id and org_id = c.broker_org_id and broker_stage = 'new';
  end if;
  return new;
end $$;
create trigger messages_after after insert on public.messages
  for each row execute function public.messages_after_insert();

-- ---------------------------------------------------------------------------
-- Grants: deny by default, then grant back precisely.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Reference lists: public read, admin write.
grant select on public.regions, public.states, public.retailers, public.categories,
  public.channels, public.distributors to anon, authenticated;
grant insert, update on public.retailers, public.categories, public.channels, public.distributors to authenticated;

grant select on public.users to authenticated;
grant update (name, phone) on public.users to authenticated;

grant select on public.organizations to anon, authenticated;
grant update (name, logo_url, website, hq_city, hq_state) on public.organizations to authenticated;

grant select on public.org_members, public.org_invites to authenticated;

grant select on public.brand_profiles to authenticated;
grant update (categories, current_distributors, current_retailers, annual_revenue_band, stage)
  on public.brand_profiles to authenticated;

grant select, insert, delete on public.briefs to authenticated;
grant update (title, category_id, regions, states, channels, target_retailers, distributors, notes, archived_at)
  on public.briefs to authenticated;

grant select on public.broker_listings to anon, authenticated;
grant update (about, years_in_business, team_size, merchandisers, channels, distributors, categories,
  conflicts, current_lines, commission_model, rate_low, rate_high, retainer, min_term_months,
  not_taking_new_lines, away_message) on public.broker_listings to authenticated;

grant select, insert, update, delete on public.broker_contacts to authenticated;
grant select on public.broker_states, public.broker_retailers to anon, authenticated;
grant insert, update, delete on public.broker_states, public.broker_retailers to authenticated;

grant select, insert, delete on public.broker_references to authenticated;
grant update (name, brand, email, phone) on public.broker_references to authenticated;

grant select on public.listing_documents to anon, authenticated;
grant insert, delete on public.listing_documents to authenticated;
grant update (is_private, file_name) on public.listing_documents to authenticated;

grant select on public.verifications to authenticated;
grant select on public.verification_reviews to authenticated;   -- policy: admins only
grant select on public.subscriptions to authenticated;

grant select, insert, delete on public.saved_brokers to authenticated;
grant update (folder, note) on public.saved_brokers to authenticated;

grant select, insert on public.placement_requests to authenticated;
grant update (status) on public.placement_requests to authenticated;  -- policy: admins only

grant select, insert on public.conversations to authenticated;
grant select on public.conversation_sides to authenticated;
grant update (brand_stage, broker_stage, archived, muted, marked_unread, assignee_user_id, last_read_at)
  on public.conversation_sides to authenticated;

grant select, insert on public.messages to authenticated;
grant select, insert, delete on public.conversation_notes to authenticated;
grant select, insert, update, delete on public.message_templates to authenticated;
grant select, insert, delete on public.org_blocks to authenticated;

grant select, insert on public.reports to authenticated;
grant update (status, resolution, resolved_at) on public.reports to authenticated;   -- policy: admins only

grant select, insert, update on public.notification_prefs to authenticated;
grant select on public.profile_events to authenticated;          -- policy: admins only
grant select, insert on public.product_events to authenticated;
grant select on public.audit_log to authenticated;                -- policy: admins only
-- stripe_events: no client access at all.

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Reference lists
create policy ref_read on public.regions for select using (true);
create policy ref_read on public.states for select using (true);
create policy ref_read on public.retailers for select using (true);
create policy ref_read on public.categories for select using (true);
create policy ref_read on public.channels for select using (true);
create policy ref_read on public.distributors for select using (true);
create policy ref_admin_insert on public.retailers for insert to authenticated with check (public.is_admin());
create policy ref_admin_update on public.retailers for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ref_admin_insert on public.categories for insert to authenticated with check (public.is_admin());
create policy ref_admin_update on public.categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ref_admin_insert on public.channels for insert to authenticated with check (public.is_admin());
create policy ref_admin_update on public.channels for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ref_admin_insert on public.distributors for insert to authenticated with check (public.is_admin());
create policy ref_admin_update on public.distributors for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- users: yourself, your teammates; admins see everyone.
create policy users_read on public.users for select to authenticated using (
  id = auth.uid()
  or public.is_admin()
  or exists (select 1 from public.org_members m where m.user_id = users.id and m.org_id = public.my_org_id())
);
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- organizations
create policy orgs_read on public.organizations for select using (
  public.is_org_member(id)
  or public.is_admin()
  -- Live brokerages are public (name, logo, HQ). Brands are never listed.
  or (type = 'broker' and public.org_listing_is_visible(id))
  -- A broker may see the name of a brand only inside a conversation that brand opened.
  or (auth.uid() is not null and public.shares_conversation_with(id))
);
create policy orgs_update on public.organizations for update to authenticated using (
  (type = 'brand' and public.is_org_owner(id))
  or (type = 'broker' and public.is_org_member(id))
  or public.is_admin()
) with check (
  (type = 'brand' and public.is_org_owner(id))
  or (type = 'broker' and public.is_org_member(id))
  or public.is_admin()
);

-- org_members / invites
create policy members_read on public.org_members for select to authenticated
  using (public.is_org_member(org_id) or public.is_admin());
create policy invites_read on public.org_invites for select to authenticated
  using (public.is_org_owner(org_id) or public.is_admin());

-- brand_profiles: the brand's own team, plus Purvey admins. Never brokers.
create policy brand_profiles_read on public.brand_profiles for select to authenticated
  using (public.is_brand_member_of(org_id) or public.is_admin());
create policy brand_profiles_update on public.brand_profiles for update to authenticated
  using (public.is_brand_member_of(org_id)) with check (public.is_brand_member_of(org_id));

-- briefs: the brand's own team only. Not brokers, not admins.
create policy briefs_read on public.briefs for select to authenticated
  using (public.is_brand_member_of(brand_org_id));
create policy briefs_insert on public.briefs for insert to authenticated
  with check (public.is_brand_member_of(brand_org_id) and created_by = auth.uid());
create policy briefs_update on public.briefs for update to authenticated
  using (public.is_brand_member_of(brand_org_id)) with check (public.is_brand_member_of(brand_org_id));
create policy briefs_delete on public.briefs for delete to authenticated
  using (public.is_brand_member_of(brand_org_id));

-- broker_listings
create policy listings_read on public.broker_listings for select using (
  public.listing_is_visible(id) or public.is_org_member(org_id) or public.is_admin()
);
create policy listings_update on public.broker_listings for update to authenticated
  using (public.is_org_member(org_id) or public.is_admin())
  with check (public.is_org_member(org_id) or public.is_admin());

-- broker_contacts: never readable by brands directly; use reveal_contact().
create policy contacts_read on public.broker_contacts for select to authenticated
  using (public.is_broker_member_of_listing(listing_id) or public.is_admin());
create policy contacts_write on public.broker_contacts for insert to authenticated
  with check (public.is_broker_member_of_listing(listing_id));
create policy contacts_update on public.broker_contacts for update to authenticated
  using (public.is_broker_member_of_listing(listing_id) or public.is_admin())
  with check (public.is_broker_member_of_listing(listing_id) or public.is_admin());
create policy contacts_delete on public.broker_contacts for delete to authenticated
  using (public.is_broker_member_of_listing(listing_id));

-- broker_states / broker_retailers: public with the listing.
create policy states_read on public.broker_states for select using (
  public.listing_is_visible(listing_id) or public.is_broker_member_of_listing(listing_id) or public.is_admin());
create policy states_insert on public.broker_states for insert to authenticated
  with check (public.is_broker_member_of_listing(listing_id));
create policy states_update on public.broker_states for update to authenticated
  using (public.is_broker_member_of_listing(listing_id)) with check (public.is_broker_member_of_listing(listing_id));
create policy states_delete on public.broker_states for delete to authenticated
  using (public.is_broker_member_of_listing(listing_id));

create policy retailers_read on public.broker_retailers for select using (
  public.listing_is_visible(listing_id) or public.is_broker_member_of_listing(listing_id) or public.is_admin());
create policy retailers_insert on public.broker_retailers for insert to authenticated
  with check (public.is_broker_member_of_listing(listing_id));
create policy retailers_update on public.broker_retailers for update to authenticated
  using (public.is_broker_member_of_listing(listing_id)) with check (public.is_broker_member_of_listing(listing_id));
create policy retailers_delete on public.broker_retailers for delete to authenticated
  using (public.is_broker_member_of_listing(listing_id));

-- broker_references: Purvey admins. The broker's own team can see what it
-- entered (needed to edit the listing). Brands and other brokers never can.
create policy references_read on public.broker_references for select to authenticated
  using (public.is_admin() or public.is_broker_member_of_listing(listing_id));
create policy references_insert on public.broker_references for insert to authenticated
  with check (public.is_broker_member_of_listing(listing_id));
create policy references_update on public.broker_references for update to authenticated
  using (public.is_broker_member_of_listing(listing_id)) with check (public.is_broker_member_of_listing(listing_id));
create policy references_delete on public.broker_references for delete to authenticated
  using (public.is_broker_member_of_listing(listing_id));

-- listing_documents: public ones go with a visible listing; private ones are
-- admin-only (plus the uploading brokerage).
create policy documents_read on public.listing_documents for select using (
  public.is_admin()
  or public.is_broker_member_of_listing(listing_id)
  or (not is_private and public.listing_is_visible(listing_id))
);
create policy documents_insert on public.listing_documents for insert to authenticated
  with check (public.is_broker_member_of_listing(listing_id) and created_by = auth.uid());
create policy documents_update on public.listing_documents for update to authenticated
  using (public.is_broker_member_of_listing(listing_id)) with check (public.is_broker_member_of_listing(listing_id));
create policy documents_delete on public.listing_documents for delete to authenticated
  using (public.is_broker_member_of_listing(listing_id));

-- verifications: the brokerage sees status and reason; admins see all.
create policy verifications_read on public.verifications for select to authenticated
  using (public.is_broker_member_of_listing(listing_id) or public.is_admin());
create policy verification_reviews_read on public.verification_reviews for select to authenticated
  using (public.is_admin());

-- subscriptions: brokerage members and admins read; writes only via webhook (service role) or admin RPC.
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (public.is_org_member(org_id) or public.is_admin());

-- saved_brokers: brand team only.
create policy saved_read on public.saved_brokers for select to authenticated using (public.is_brand_member_of(brand_org_id));
create policy saved_insert on public.saved_brokers for insert to authenticated
  with check (public.is_brand_member_of(brand_org_id) and created_by = auth.uid() and public.listing_is_visible(listing_id));
create policy saved_update on public.saved_brokers for update to authenticated
  using (public.is_brand_member_of(brand_org_id)) with check (public.is_brand_member_of(brand_org_id));
create policy saved_delete on public.saved_brokers for delete to authenticated using (public.is_brand_member_of(brand_org_id));

-- placement_requests: the brand that asked, and Purvey admins. Never brokers.
create policy placements_read on public.placement_requests for select to authenticated
  using (public.is_brand_member_of(brand_org_id) or public.is_admin());
create policy placements_insert on public.placement_requests for insert to authenticated
  with check (public.is_brand_member_of(brand_org_id) and created_by = auth.uid() and status = 'new'
              and public.listing_is_visible(listing_id));
create policy placements_admin_update on public.placement_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- conversations: the two parties. Admins only once reported (and messages
-- only through admin_read_thread(), which writes the audit log).
create policy conversations_read on public.conversations for select to authenticated using (
  public.is_org_member(brand_org_id) or public.is_org_member(broker_org_id)
  or (public.is_admin() and reported_at is not null)
);
create policy conversations_insert on public.conversations for insert to authenticated with check (
  started_by = auth.uid() and public.is_brand_member_of(brand_org_id)
);

create policy sides_read on public.conversation_sides for select to authenticated using (public.is_org_member(org_id));
create policy sides_update on public.conversation_sides for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

create policy messages_read on public.messages for select to authenticated using (public.is_conversation_party(conversation_id));
create policy messages_insert on public.messages for insert to authenticated with check (
  sender_user_id = auth.uid()
  and sender_org_id = public.my_org_id()
  and is_auto_reply = false
  and public.is_conversation_party(conversation_id)
);

create policy notes_read on public.conversation_notes for select to authenticated
  using (public.is_org_member(org_id) and public.is_conversation_party(conversation_id));
create policy notes_insert on public.conversation_notes for insert to authenticated
  with check (public.is_org_member(org_id) and public.is_conversation_party(conversation_id) and author_user_id = auth.uid());
create policy notes_delete on public.conversation_notes for delete to authenticated
  using (public.is_org_member(org_id) and author_user_id = auth.uid());

create policy templates_all on public.message_templates for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

create policy blocks_read on public.org_blocks for select to authenticated using (public.is_org_member(blocker_org_id));
create policy blocks_insert on public.org_blocks for insert to authenticated
  with check (public.is_org_member(blocker_org_id) and created_by = auth.uid() and public.shares_conversation_with(blocked_org_id));
create policy blocks_delete on public.org_blocks for delete to authenticated using (public.is_org_member(blocker_org_id));

create policy reports_read on public.reports for select to authenticated
  using (reporter_user_id = auth.uid() or public.is_admin());
create policy reports_insert on public.reports for insert to authenticated with check (
  reporter_user_id = auth.uid()
  and reporter_org_id = public.my_org_id()
  and status = 'open'
  and (
    (conversation_id is not null and public.is_conversation_party(conversation_id))
    or (listing_id is not null and public.listing_is_visible(listing_id))
  )
);
create policy reports_admin_update on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy prefs_read on public.notification_prefs for select to authenticated using (user_id = auth.uid());
create policy prefs_insert on public.notification_prefs for insert to authenticated with check (user_id = auth.uid());
create policy prefs_update on public.notification_prefs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- profile_events: raw rows (which carry brand_org_id) are admin-only. Brokers
-- get aggregate counts from listing_analytics(), never the list of brands.
create policy profile_events_admin on public.profile_events for select to authenticated using (public.is_admin());

create policy product_events_insert on public.product_events for insert to authenticated
  with check (user_id = auth.uid() and (org_id is null or org_id = public.my_org_id()));
create policy product_events_admin on public.product_events for select to authenticated using (public.is_admin());

create policy audit_admin on public.audit_log for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Function privileges. Policies call these helpers as anon/authenticated.
-- Everything else is revoked; RPCs are granted one by one in the functions
-- migration.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_admin(), public.my_org_id(), public.my_org_type(), public.is_org_member(uuid),
  public.is_org_owner(uuid), public.is_brand_member_of(uuid), public.is_broker_member_of_listing(uuid),
  public.listing_is_visible(uuid), public.org_listing_is_visible(uuid),
  public.is_conversation_party(uuid), public.shares_conversation_with(uuid)
  to anon, authenticated, service_role;
-- Called from non-definer triggers, so the writing role needs EXECUTE.
grant execute on function
  public.assert_org_type(uuid, public.org_type), public.assert_ref_ids(integer[], text),
  public.assert_state_codes(text[]), public.compute_completeness(public.broker_listings)
  to authenticated, service_role;

-- Realtime for the inbox (only on Supabase, where the publication exists).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.conversations, public.conversation_sides;
  end if;
end $$;
