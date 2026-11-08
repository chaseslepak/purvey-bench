-- A cancelled subscription pauses the listing.
--
-- "Cancel" in the billing portal is cancel-at-period-end: Stripe keeps the
-- subscription `active` until the paid period ends, so the listing stays live
-- for the time already paid for, then the status becomes `canceled`.
-- An immediate `canceled` (e.g. after failed payments run out, when a new,
-- unpaid period has already started) must NOT stay live until that period's
-- end, which the previous rule allowed.
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
    or (s.status = 'past_due' and s.past_due_since is not null and s.past_due_since > now() - interval '7 days');
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

revoke execute on function public.sync_listing_status(uuid) from public, anon, authenticated;
grant execute on function public.sync_listing_status(uuid) to service_role;
