-- Phase 2: listing builder support.

-- ---------------------------------------------------------------------------
-- Profile strength: one checklist, used for the score and for the builder's
-- "what's missing" list. Each item names the builder step that fixes it.
-- ---------------------------------------------------------------------------
create or replace function public.listing_checklist(l public.broker_listings)
returns table (key text, label text, step smallint, done boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.organizations;
  c public.broker_contacts;
  n_retailers int;
  n_refs int;
begin
  select * into o from public.organizations where id = l.org_id;
  select * into c from public.broker_contacts where listing_id = l.id;
  select count(*) into n_retailers from public.broker_retailers r where r.listing_id = l.id;
  select count(*) into n_refs from public.broker_references r where r.listing_id = l.id;
  return query values
    ('about',       'Describe your brokerage (at least 40 characters)', 1::smallint, coalesce(char_length(l.about) >= 40, false)),
    ('logo',        'Upload your logo',                                  1::smallint, o.logo_url is not null),
    ('website',     'Add your website',                                  1::smallint, o.website is not null),
    ('hq',          'Add your HQ city and state',                        1::smallint, o.hq_city is not null and o.hq_state is not null),
    ('contact',     'Add a public contact name and email',               1::smallint, coalesce(c.name is not null and c.email is not null, false)),
    ('phone',       'Add a contact phone number',                        1::smallint, c.phone is not null),
    ('states',      'Choose the states you cover',                       2::smallint, exists (select 1 from public.broker_states s where s.listing_id = l.id)),
    ('channels',    'Choose your channels',                              2::smallint, cardinality(l.channels) > 0),
    ('distributors','Choose the distributors you work with',             2::smallint, cardinality(l.distributors) > 0),
    ('retailers',   'Add at least three retailers with call frequency',  3::smallint, n_retailers >= 3),
    ('categories',  'Choose the categories you sell',                    4::smallint, cardinality(l.categories) > 0),
    ('terms',       'Set your commission model and rate or retainer',    5::smallint, l.commission_model is not null and (l.rate_low is not null or l.retainer is not null)),
    ('min_term',    'Set a minimum term',                                5::smallint, l.min_term_months is not null),
    ('years',       'Add years in business',                             6::smallint, l.years_in_business is not null),
    ('team',        'Add your team size',                                6::smallint, l.team_size is not null),
    ('references',  'Add two brand references',                          6::smallint, n_refs >= 2),
    ('document',    'Upload a line card or capabilities deck',           6::smallint, exists (select 1 from public.listing_documents d where d.listing_id = l.id));
end $$;

create or replace function public.compute_completeness(l public.broker_listings)
returns smallint language sql stable security definer set search_path = '' as $$
  select round(100.0 * count(*) filter (where done) / count(*))::smallint from public.listing_checklist(l);
$$;

-- The caller's own checklist (brokerage members only).
create or replace function public.my_listing_checklist()
returns table (key text, label text, step smallint, done boolean)
language sql stable security definer set search_path = '' as $$
  select c.* from public.broker_listings l, public.listing_checklist(l) c
  where l.org_id = public.my_org_id() and public.is_org_member(l.org_id);
$$;

-- ---------------------------------------------------------------------------
-- Builder saves: replace states / retailers atomically. SECURITY INVOKER, so
-- the caller's RLS policies still decide what they may write.
-- ---------------------------------------------------------------------------
create or replace function public.save_listing_states(p_listing uuid, p_states text[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_broker_member_of_listing(p_listing) then
    raise exception 'not your listing' using errcode = '42501';
  end if;
  perform public.assert_state_codes(p_states);
  delete from public.broker_states where listing_id = p_listing and state_code <> all (p_states);
  insert into public.broker_states (listing_id, state_code)
    select p_listing, s from unnest(p_states) s on conflict do nothing;
end $$;

-- p_rows: [{ "retailer_id": 12 } | { "custom_name": "Lunds" }, "call_frequency": "weekly" ]
create or replace function public.save_listing_retailers(p_listing uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_broker_member_of_listing(p_listing) then
    raise exception 'not your listing' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 300 then
    raise exception 'invalid retailers' using errcode = '22023';
  end if;
  delete from public.broker_retailers where listing_id = p_listing;
  insert into public.broker_retailers (listing_id, retailer_id, custom_name, call_frequency)
    select p_listing,
           nullif(r ->> 'retailer_id', '')::integer,
           nullif(trim(r ->> 'custom_name'), ''),
           (r ->> 'call_frequency')::public.call_frequency
      from jsonb_array_elements(p_rows) r;
end $$;

-- Replace the two (or more) references in one go.
create or replace function public.save_listing_references(p_listing uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_broker_member_of_listing(p_listing) then
    raise exception 'not your listing' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5 then
    raise exception 'invalid references' using errcode = '22023';
  end if;
  delete from public.broker_references where listing_id = p_listing;
  insert into public.broker_references (listing_id, name, brand, email, phone)
    select p_listing, trim(r ->> 'name'), trim(r ->> 'brand'), nullif(trim(r ->> 'email'), ''), nullif(trim(r ->> 'phone'), '')
      from jsonb_array_elements(p_rows) r
     where nullif(trim(r ->> 'name'), '') is not null and nullif(trim(r ->> 'brand'), '') is not null;
end $$;

-- Billing bookkeeping columns.
alter table public.subscriptions add column if not exists stripe_price_id text;

revoke execute on function public.listing_checklist(public.broker_listings) from public, anon;
grant execute on function public.listing_checklist(public.broker_listings) to authenticated, service_role;
revoke execute on function public.my_listing_checklist(), public.save_listing_states(uuid, text[]),
  public.save_listing_retailers(uuid, jsonb), public.save_listing_references(uuid, jsonb) from public, anon;
grant execute on function public.my_listing_checklist(), public.save_listing_states(uuid, text[]),
  public.save_listing_retailers(uuid, jsonb), public.save_listing_references(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage (Supabase only; skipped on the local test database).
--   logos:         public read; brokerage/brand members write under <org_id>/
--   listing-docs:  private; read follows listing_documents RLS (public docs of
--                  live listings, the brokerage itself, admins); members write
--                  under <listing_id>/. Files are served through signed URLs.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema not present; skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('listing-docs', 'listing-docs', false, 10485760, array['application/pdf'])
  on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute $p$drop policy if exists bench_logos_read on storage.objects$p$;
  execute $p$create policy bench_logos_read on storage.objects for select using (bucket_id = 'logos')$p$;
  execute $p$drop policy if exists bench_logos_write on storage.objects$p$;
  execute $p$create policy bench_logos_write on storage.objects for insert to authenticated
    with check (bucket_id = 'logos' and public.is_org_member(((storage.foldername(name))[1])::uuid))$p$;
  execute $p$drop policy if exists bench_logos_update on storage.objects$p$;
  execute $p$create policy bench_logos_update on storage.objects for update to authenticated
    using (bucket_id = 'logos' and public.is_org_member(((storage.foldername(name))[1])::uuid))$p$;
  execute $p$drop policy if exists bench_logos_delete on storage.objects$p$;
  execute $p$create policy bench_logos_delete on storage.objects for delete to authenticated
    using (bucket_id = 'logos' and public.is_org_member(((storage.foldername(name))[1])::uuid))$p$;

  execute $p$drop policy if exists bench_docs_read on storage.objects$p$;
  execute $p$create policy bench_docs_read on storage.objects for select to authenticated
    using (bucket_id = 'listing-docs' and exists (select 1 from public.listing_documents d where d.storage_path = storage.objects.name))$p$;
  execute $p$drop policy if exists bench_docs_write on storage.objects$p$;
  execute $p$create policy bench_docs_write on storage.objects for insert to authenticated
    with check (bucket_id = 'listing-docs' and public.is_broker_member_of_listing(((storage.foldername(name))[1])::uuid))$p$;
  execute $p$drop policy if exists bench_docs_delete on storage.objects$p$;
  execute $p$create policy bench_docs_delete on storage.objects for delete to authenticated
    using (bucket_id = 'listing-docs' and public.is_broker_member_of_listing(((storage.foldername(name))[1])::uuid))$p$;
end $$;
