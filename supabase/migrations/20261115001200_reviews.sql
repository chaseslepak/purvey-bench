-- Brand reviews of brokers (1–5 stars) and brand-offered references.
--   * Only a brand a broker has actually replied to on Bench can review it.
--   * One review per brand per listing; the brand can edit it.
--   * Public reviews are anonymous ("Brand on Bench") unless the brand opts
--     to show its name: brands are never listed otherwise.
--   * Ratings are shown, never used for ranking (ranking stays fit only).
--   * A brand reference is Purvey-only, like the broker's own references.

create table public.broker_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.broker_listings(id) on delete cascade,
  brand_org_id uuid not null references public.organizations(id) on delete cascade,
  author_user_id uuid references public.users(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  title text check (title is null or char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 20 and 4000),
  show_brand_name boolean not null default false,
  hidden_at timestamptz,
  hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 500),
  flagged_at timestamptz,
  flag_reason text check (flag_reason is null or char_length(flag_reason) <= 1000),
  response text check (response is null or char_length(response) between 1 and 2000),
  response_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, brand_org_id)
);
create index broker_reviews_listing on public.broker_reviews (listing_id) where hidden_at is null;
create trigger broker_reviews_touch before update on public.broker_reviews for each row execute function public.touch_updated_at();

create table public.brand_references (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.broker_listings(id) on delete cascade,
  brand_org_id uuid not null references public.organizations(id) on delete cascade,
  author_user_id uuid references public.users(id) on delete set null,
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  note text check (note is null or char_length(note) <= 2000),
  status public.reference_status not null default 'pending',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, brand_org_id)
);
create trigger brand_references_touch before update on public.brand_references for each row execute function public.touch_updated_at();

alter table public.broker_reviews enable row level security;
alter table public.brand_references enable row level security;
revoke all on public.broker_reviews, public.brand_references from anon, authenticated;
-- Raw rows (which carry the brand) only to the brand's own team and admins.
-- The public and the broker read reviews through listing_reviews().
grant select on public.broker_reviews, public.brand_references to authenticated;
create policy reviews_read on public.broker_reviews for select to authenticated
  using (public.is_brand_member_of(brand_org_id) or public.is_admin());
create policy brand_refs_read on public.brand_references for select to authenticated
  using (public.is_brand_member_of(brand_org_id) or public.is_admin());

-- A brand may review a listing once that broker has replied to it on Bench.
create or replace function public.can_review(p_listing uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.my_org_type() = 'brand' and exists (
    select 1 from public.conversations c
      join public.broker_listings l on l.org_id = c.broker_org_id and l.id = p_listing
     where c.brand_org_id = public.my_org_id()
       and exists (select 1 from public.messages m where m.conversation_id = c.id and m.sender_org_id = c.broker_org_id and not m.is_auto_reply));
$$;

create or replace function public.submit_review(p_listing uuid, p_rating integer, p_title text, p_body text, p_show_name boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_new boolean;
begin
  if not public.can_review(p_listing) then
    raise exception 'you can review a broker once they have replied to you on Bench' using errcode = '42501';
  end if;
  v_new := not exists (select 1 from public.broker_reviews where listing_id = p_listing and brand_org_id = public.my_org_id());
  insert into public.broker_reviews (listing_id, brand_org_id, author_user_id, rating, title, body, show_brand_name)
  values (p_listing, public.my_org_id(), auth.uid(), p_rating, nullif(trim(p_title), ''), trim(p_body), coalesce(p_show_name, false))
  on conflict (listing_id, brand_org_id) do update set
    rating = excluded.rating, title = excluded.title, body = excluded.body, show_brand_name = excluded.show_brand_name,
    author_user_id = excluded.author_user_id, flagged_at = null, flag_reason = null
  returning id into v_id;
  if v_new then
    insert into public.email_outbox (to_user_id, kind, payload)
    select m.user_id, 'review_received', jsonb_build_object('rating', p_rating, 'title', p_title)
      from public.broker_listings l join public.org_members m on m.org_id = l.org_id
     where l.id = p_listing;
  end if;
  return v_id;
end $$;

create or replace function public.delete_my_review(p_listing uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.broker_reviews where listing_id = p_listing and brand_org_id = public.my_org_id() and public.my_org_type() = 'brand';
$$;

create or replace function public.submit_brand_reference(p_listing uuid, p_name text, p_email text, p_phone text, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.can_review(p_listing) then
    raise exception 'you can vouch for a broker once they have replied to you on Bench' using errcode = '42501';
  end if;
  insert into public.brand_references (listing_id, brand_org_id, author_user_id, contact_name, contact_email, contact_phone, note)
  values (p_listing, public.my_org_id(), auth.uid(), trim(p_name), nullif(lower(trim(p_email)), ''), nullif(trim(p_phone), ''), nullif(trim(p_note), ''))
  on conflict (listing_id, brand_org_id) do update set
    contact_name = excluded.contact_name, contact_email = excluded.contact_email, contact_phone = excluded.contact_phone, note = excluded.note
  returning id into v_id;
  perform public.enqueue_admin_email('admin_reference_offered', jsonb_build_object(
    'brand', (select name from public.organizations where id = public.my_org_id()),
    'broker', (select o.name from public.broker_listings l join public.organizations o on o.id = l.org_id where l.id = p_listing)));
  return v_id;
end $$;

-- Public reviews for a visible listing (or your own listing), brand shown only by consent.
create or replace function public.listing_reviews(p_listing uuid)
returns table (id uuid, rating smallint, title text, body text, author text, created_at timestamptz, updated_at timestamptz,
               response text, response_at timestamptz, mine boolean, flagged boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.rating, r.title, r.body,
         case when r.show_brand_name then o.name else 'Brand on Bench' end,
         r.created_at, r.updated_at, r.response, r.response_at,
         coalesce(r.brand_org_id = public.my_org_id(), false),
         r.flagged_at is not null and public.is_broker_member_of_listing(p_listing)
    from public.broker_reviews r join public.organizations o on o.id = r.brand_org_id
   where r.listing_id = p_listing and r.hidden_at is null
     and (public.listing_is_visible(p_listing) or public.is_broker_member_of_listing(p_listing) or public.is_admin())
   order by r.created_at desc;
$$;

-- Average and count per listing, for profiles and search cards.
create or replace function public.listing_ratings(p_listings uuid[])
returns table (listing_id uuid, average numeric, reviews bigint)
language sql stable security definer set search_path = '' as $$
  select r.listing_id, round(avg(r.rating)::numeric, 1), count(*)
    from public.broker_reviews r
   where r.listing_id = any(p_listings) and r.hidden_at is null
     and (public.listing_is_visible(r.listing_id) or public.is_broker_member_of_listing(r.listing_id) or public.is_admin())
   group by r.listing_id;
$$;

-- The broker answers once (can edit) or flags a review for Purvey.
create or replace function public.respond_to_review(p_review uuid, p_text text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.broker_reviews r set response = nullif(trim(p_text), ''), response_at = case when nullif(trim(p_text), '') is null then null else now() end
   where r.id = p_review and public.is_broker_member_of_listing(r.listing_id);
  if not found then raise exception 'not your review to answer' using errcode = '42501'; end if;
end $$;

create or replace function public.flag_review(p_review uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'tell Purvey what is wrong' using errcode = '23514'; end if;
  update public.broker_reviews r set flagged_at = now(), flag_reason = left(trim(p_reason), 1000)
   where r.id = p_review and public.is_broker_member_of_listing(r.listing_id);
  if not found then raise exception 'not your review to flag' using errcode = '42501'; end if;
  perform public.enqueue_admin_email('admin_review_flagged', jsonb_build_object('id', p_review, 'reason', left(p_reason, 400),
    'broker', (select o.name from public.broker_reviews r join public.broker_listings l on l.id = r.listing_id join public.organizations o on o.id = l.org_id where r.id = p_review)));
end $$;

create or replace function public.admin_set_review_hidden(p_review uuid, p_hidden boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  update public.broker_reviews set hidden_at = case when p_hidden then now() end, hidden_reason = case when p_hidden then p_reason end,
         flagged_at = null, flag_reason = null
   where id = p_review;
  if not found then raise exception 'review not found' using errcode = '22023'; end if;
  perform public.write_audit(case when p_hidden then 'review.hide' else 'review.restore' end, 'broker_review', p_review::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_update_brand_reference(p_ref uuid, p_status public.reference_status, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  update public.brand_references set status = p_status, admin_notes = nullif(left(trim(p_notes), 4000), '') where id = p_ref;
  if not found then raise exception 'reference not found' using errcode = '22023'; end if;
  perform public.write_audit('brand_reference.update', 'brand_reference', p_ref::text, jsonb_build_object('status', p_status));
end $$;

revoke execute on function public.can_review(uuid), public.submit_review(uuid, integer, text, text, boolean), public.delete_my_review(uuid),
  public.submit_brand_reference(uuid, text, text, text, text), public.respond_to_review(uuid, text), public.flag_review(uuid, text),
  public.admin_set_review_hidden(uuid, boolean, text), public.admin_update_brand_reference(uuid, public.reference_status, text),
  public.listing_reviews(uuid), public.listing_ratings(uuid[]) from public;
grant execute on function public.can_review(uuid), public.submit_review(uuid, integer, text, text, boolean), public.delete_my_review(uuid),
  public.submit_brand_reference(uuid, text, text, text, text), public.respond_to_review(uuid, text), public.flag_review(uuid, text),
  public.admin_set_review_hidden(uuid, boolean, text), public.admin_update_brand_reference(uuid, public.reference_status, text) to authenticated;
grant execute on function public.listing_reviews(uuid), public.listing_ratings(uuid[]) to anon, authenticated;
