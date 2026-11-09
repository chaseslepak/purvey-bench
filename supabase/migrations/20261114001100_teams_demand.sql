-- Teams: every brand and brokerage can have any number of teammates at no
-- extra cost. An organization always keeps at least one owner.
create or replace function public.set_member_role(p_user uuid, p_role public.member_role)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.my_org_id();
begin
  if not public.is_org_owner(v_org) then
    raise exception 'only owners can change roles' using errcode = '42501';
  end if;
  if p_role = 'member' and (select count(*) from public.org_members where org_id = v_org and role = 'owner' and user_id <> p_user) = 0 then
    raise exception 'a team needs at least one owner' using errcode = '23514';
  end if;
  update public.org_members set role = p_role where org_id = v_org and user_id = p_user;
  if not found then raise exception 'not a teammate' using errcode = '22023'; end if;
end $$;

create or replace function public.remove_member(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.my_org_id();
begin
  -- Owners remove anyone; members may remove themselves (leave).
  if p_user <> auth.uid() and not public.is_org_owner(v_org) then
    raise exception 'only owners can remove teammates' using errcode = '42501';
  end if;
  if exists (select 1 from public.org_members where org_id = v_org and user_id = p_user and role = 'owner')
     and (select count(*) from public.org_members where org_id = v_org and role = 'owner') = 1 then
    raise exception 'a team needs at least one owner: make someone else an owner first' using errcode = '23514';
  end if;
  -- Their open assignments go back to unassigned.
  update public.conversation_sides set assignee_user_id = null where org_id = v_org and assignee_user_id = p_user;
  delete from public.org_members where org_id = v_org and user_id = p_user;
  if not found then raise exception 'not a teammate' using errcode = '22023'; end if;
end $$;

-- Email a teammate when a conversation is assigned to them (not when they assign themselves).
create or replace function public.assignment_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_user_id is not null and new.assignee_user_id is distinct from old.assignee_user_id
     and new.assignee_user_id is distinct from auth.uid() then
    insert into public.email_outbox (to_user_id, kind, payload)
    values (new.assignee_user_id, 'conversation_assigned', jsonb_build_object(
      'conversation_id', new.conversation_id,
      'by', (select coalesce(name, email) from public.users where id = auth.uid()),
      'other', (select o.name from public.conversations c join public.organizations o
                 on o.id = case when c.brand_org_id = new.org_id then c.broker_org_id else c.brand_org_id end
                where c.id = new.conversation_id)));
  end if;
  return new;
end $$;
create trigger conversation_sides_assigned after update of assignee_user_id on public.conversation_sides
  for each row execute function public.assignment_notify();

-- ---------------------------------------------------------------------------
-- Sign-up landing lists (public, anonymous aggregates)
-- ---------------------------------------------------------------------------

-- For brokers: retailers and distributors brands are seeking representation
-- for, from brands' active briefs and their searches in the last 90 days.
-- Counts are of distinct brands, and an item shows only once at least 3
-- brands want it, so no single brand's plans can be read from the list.
create or replace function public.public_demand(p_limit integer default 24)
returns table (kind text, id integer, name text, brands bigint)
language sql stable security definer set search_path = '' as $$
  with wants as (
    select 'retailer'::text as kind, r.id as item, b.brand_org_id as brand
      from public.briefs b cross join lateral unnest(b.target_retailers) as r(id)
     where b.archived_at is null
    union
    select 'distributor', d.id, b.brand_org_id
      from public.briefs b cross join lateral unnest(b.distributors) as d(id)
     where b.archived_at is null
    union
    select 'retailer', (x)::int, e.org_id
      from public.product_events e cross join lateral jsonb_array_elements_text(coalesce(e.props -> 'retailers', '[]')) x
     where e.name = 'search' and e.org_id is not null and e.created_at > now() - interval '90 days'
    union
    select 'distributor', (x)::int, e.org_id
      from public.product_events e cross join lateral jsonb_array_elements_text(coalesce(e.props -> 'distributors', '[]')) x
     where e.name = 'search' and e.org_id is not null and e.created_at > now() - interval '90 days'
  ), counted as (
    select w.kind, w.item, count(distinct w.brand) as brands
      from wants w join public.organizations o on o.id = w.brand and o.suspended_at is null
     group by w.kind, w.item
    having count(distinct w.brand) >= 3
  )
  select c.kind, c.item, coalesce(r.name, d.name), c.brands
    from counted c
    left join public.retailers r on c.kind = 'retailer' and r.id = c.item and r.active
    left join public.distributors d on c.kind = 'distributor' and d.id = c.item and d.active
   where coalesce(r.name, d.name) is not null
   order by c.brands desc, 3
   limit least(greatest(p_limit, 1), 60);
$$;

-- For brands: retailers and distributors that live brokers on Bench cover.
create or replace function public.public_coverage(p_limit integer default 24)
returns table (kind text, id integer, name text, brokers bigint)
language sql stable security definer set search_path = '' as $$
  with live as (
    select l.id, l.distributors from public.broker_listings l where public.listing_is_visible(l.id)
  ), items as (
    select 'retailer'::text as kind, br.retailer_id as item, br.listing_id as listing
      from public.broker_retailers br join live on live.id = br.listing_id where br.retailer_id is not null
    union
    select 'distributor', d.id, live.id from live cross join lateral unnest(live.distributors) as d(id)
  )
  select i.kind, i.item, coalesce(r.name, d.name), count(distinct i.listing) as brokers
    from items i
    left join public.retailers r on i.kind = 'retailer' and r.id = i.item and r.active
    left join public.distributors d on i.kind = 'distributor' and d.id = i.item and d.active
   where coalesce(r.name, d.name) is not null
   group by i.kind, i.item, coalesce(r.name, d.name)
   order by brokers desc, 3
   limit least(greatest(p_limit, 1), 60);
$$;

revoke execute on function public.public_demand(integer), public.public_coverage(integer) from public;
grant execute on function public.public_demand(integer), public.public_coverage(integer) to anon, authenticated;
