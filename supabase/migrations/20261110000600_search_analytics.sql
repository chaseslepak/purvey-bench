-- Phase 3: search logging, saves in analytics, broker suggestions.

-- A brand saving a broker counts as a 'save' on that listing's analytics.
create or replace function public.saved_brokers_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profile_events (listing_id, type, brand_org_id, user_id)
  values (new.listing_id, 'save', new.brand_org_id, new.created_by);
  return new;
end $$;
create trigger saved_brokers_event after insert on public.saved_brokers
  for each row execute function public.saved_brokers_event();

-- Log the filters of a search (ids and state codes only; never brief content).
-- Brokers see these only as anonymous counts through broker_suggestions().
create or replace function public.log_search(p_filters jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare clean jsonb := '{}'; k text;
begin
  foreach k in array array['retailers', 'channels', 'categories', 'distributors'] loop
    if jsonb_typeof(p_filters -> k) = 'array' then
      clean := clean || jsonb_build_object(k, (select coalesce(jsonb_agg(v::int), '[]') from (
        select x as v from jsonb_array_elements_text(p_filters -> k) x where x ~ '^[0-9]{1,9}$' limit 20) s));
    end if;
  end loop;
  if jsonb_typeof(p_filters -> 'states') = 'array' then
    clean := clean || jsonb_build_object('states', (select coalesce(jsonb_agg(x), '[]') from (
      select x from jsonb_array_elements_text(p_filters -> 'states') x where x ~ '^[A-Z]{2}$' limit 51) s));
  end if;
  if clean = '{}' then return; end if;
  insert into public.product_events (name, user_id, org_id, props)
  values ('search', auth.uid(), case when public.my_org_type() = 'brand' then public.my_org_id() end, clean);
end $$;

-- What brands searched for in the last 30 days that this brokerage doesn't
-- cover (or covers less than weekly). Anonymous counts only.
create or replace function public.broker_suggestions()
returns table (kind text, ref text, label text, searches bigint, current text)
language sql stable security definer set search_path = '' as $$
  with me as (
    select l.id from public.broker_listings l where l.org_id = public.my_org_id() and public.is_org_member(l.org_id)
  ), s as (
    select props from public.product_events where name = 'search' and created_at > now() - interval '30 days'
  ), r as (
    select (x)::int as id, count(*) n from s, jsonb_array_elements_text(s.props -> 'retailers') x group by 1
  ), st as (
    select x as code, count(*) n from s, jsonb_array_elements_text(s.props -> 'states') x group by 1
  )
  (select 'retailer', r.id::text, rt.name, r.n, br.call_frequency::text
     from r join public.retailers rt on rt.id = r.id
     left join public.broker_retailers br on br.retailer_id = r.id and br.listing_id = (select id from me)
    where (select id from me) is not null and (br.call_frequency is null or br.call_frequency <> 'weekly')
    order by r.n desc limit 5)
  union all
  (select 'state', st.code, sn.name, st.n, null
     from st join public.states sn on sn.code = st.code
    where (select id from me) is not null
      and not exists (select 1 from public.broker_states bs where bs.listing_id = (select id from me) and bs.state_code = st.code)
    order by st.n desc limit 5);
$$;

revoke execute on function public.log_search(jsonb), public.broker_suggestions() from public;
grant execute on function public.log_search(jsonb) to anon, authenticated;
grant execute on function public.broker_suggestions() to authenticated;
