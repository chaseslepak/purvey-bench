-- RepHunter learnings (Nov 17 2026).
--  1. Broker responsiveness: how often and how fast a brokerage answers brands.
--     Display only. Ranking stays by fit (README rule 4).
--  2. Saved searches with a weekly email when new brokers match.

-- ---------------------------------------------------------------------------
-- 1. Responsiveness
-- ---------------------------------------------------------------------------
-- For each brokerage, over conversations brands started in the last 180 days
-- that are at least 2 days old (so a thread from this morning can't count as
-- ignored): how many it received, how many it answered (a real reply, not an
-- away-mode auto-reply, or a decline with a reason, which also answers the
-- brand), and the median hours to that first answer.
-- Aggregates only; never exposes a thread. Callable by anyone, like ratings.
create or replace function public.broker_responsiveness(p_orgs uuid[])
returns table (org_id uuid, received integer, answered integer, median_hours numeric)
language sql stable security definer set search_path = '' as $$
  with conv as (
    select c.id, c.broker_org_id, c.created_at, c.declined_at,
           (select min(m.created_at) from public.messages m
             where m.conversation_id = c.id and m.sender_org_id = c.broker_org_id and not m.is_auto_reply) as first_reply
      from public.conversations c
     where c.broker_org_id = any(p_orgs)
       and c.created_at >= now() - interval '180 days'
       and c.created_at <= now() - interval '2 days'
  ), answered as (
    select broker_org_id, created_at,
           least(coalesce(first_reply, 'infinity'::timestamptz), coalesce(declined_at, 'infinity'::timestamptz)) as answered_at
      from conv
  )
  select broker_org_id,
         count(*)::integer,
         count(*) filter (where answered_at < 'infinity')::integer,
         round((percentile_cont(0.5) within group (order by extract(epoch from (answered_at - created_at)) / 3600)
                filter (where answered_at < 'infinity'))::numeric, 1)
    from answered
   group by broker_org_id;
$$;
revoke all on function public.broker_responsiveness(uuid[]) from public;
grant execute on function public.broker_responsiveness(uuid[]) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Saved searches
-- ---------------------------------------------------------------------------
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  brand_org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  -- The /find query string as an object (state, region, retailer, channel, ...),
  -- validated by the app's filter schema before it is stored.
  filters jsonb not null default '{}' check (jsonb_typeof(filters) = 'object'),
  -- Weekly email when brokers that match go live. Sent to whoever saved it.
  alerts boolean not null default true,
  last_alert_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index saved_searches_org on public.saved_searches (brand_org_id, created_at desc);
create index saved_searches_alerts on public.saved_searches (last_alert_at) where alerts;

create trigger saved_searches_type before insert or update on public.saved_searches
  for each row execute function public.check_brand_org('brand_org_id');

-- At most 25 per brand team.
create or replace function public.saved_searches_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.saved_searches where brand_org_id = new.brand_org_id) >= 25 then
    raise exception 'a team can keep up to 25 saved searches';
  end if;
  return new;
end $$;
create trigger saved_searches_limit before insert on public.saved_searches
  for each row execute function public.saved_searches_limit();

alter table public.saved_searches enable row level security;
create policy saved_searches_select on public.saved_searches for select to authenticated
  using (public.is_brand_member_of(brand_org_id));
create policy saved_searches_insert on public.saved_searches for insert to authenticated
  with check (public.is_brand_member_of(brand_org_id) and created_by = auth.uid());
create policy saved_searches_update on public.saved_searches for update to authenticated
  using (public.is_brand_member_of(brand_org_id)) with check (public.is_brand_member_of(brand_org_id));
create policy saved_searches_delete on public.saved_searches for delete to authenticated
  using (public.is_brand_member_of(brand_org_id));
-- Only the name and alert switch change after creation (the cron moves last_alert_at as service role).
grant select, insert, delete on public.saved_searches to authenticated;
grant update (name, alerts) on public.saved_searches to authenticated;
