-- Brand profile v2: a full brand profile (RangeMe-style), its products, the
-- retailers/distributors it wants to be in, and a data room of collateral.
--
-- Who sees it: the brand's own team, Purvey admins, and brokers the brand has
-- started a conversation with. Brands are still never listed publicly.

alter table public.brand_profiles
  add column about text check (about is null or char_length(about) <= 2000),
  add column founded_year integer check (founded_year is null or founded_year between 1800 and 2100),
  add column current_doors integer check (current_doors is null or current_doors between 0 and 1000000),
  add column current_states text[] not null default '{}',
  add column current_channels integer[] not null default '{}',
  add column target_retailers integer[] not null default '{}',
  add column target_distributors integer[] not null default '{}',
  add column target_regions text[] not null default '{}',
  add column target_states text[] not null default '{}',
  add column target_channels integer[] not null default '{}',
  add column certifications text[] not null default '{}'
    check (certifications <@ array['organic','non_gmo','gluten_free','vegan','kosher','halal','keto','paleo','fair_trade','b_corp','women_owned','minority_owned','veteran_owned','plant_based','whole30']),
  add column storage text check (storage is null or storage in ('ambient','refrigerated','frozen')),
  add column timeline text check (timeline is null or timeline in ('now','3_months','6_months','exploring')),
  add column commission_pref public.commission_model,
  add column max_rate numeric(5,2) check (max_rate is null or max_rate between 0 and 100),
  add column max_retainer numeric(10,2) check (max_retainer is null or max_retainer >= 0),
  add column trade_budget_band text check (trade_budget_band is null or trade_budget_band in ('under_10k','10k_50k','50k_150k','150k_plus')),
  add column looking_for text check (looking_for is null or char_length(looking_for) <= 2000);

alter table public.brand_profiles
  add constraint brand_profiles_revenue_band check (annual_revenue_band is null or annual_revenue_band in ('pre_revenue','under_250k','250k_1m','1m_5m','5m_20m','20m_plus')),
  add constraint brand_profiles_stage check (stage is null or stage in ('launching','regional','national','established'));

create or replace function public.check_brand_profile_refs()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.assert_ref_ids(new.categories, 'categories');
  perform public.assert_ref_ids(new.current_distributors, 'distributors');
  perform public.assert_ref_ids(new.current_retailers, 'retailers');
  perform public.assert_ref_ids(new.current_channels, 'channels');
  perform public.assert_ref_ids(new.target_retailers, 'retailers');
  perform public.assert_ref_ids(new.target_distributors, 'distributors');
  perform public.assert_ref_ids(new.target_channels, 'channels');
  if exists (select 1 from unnest(new.current_states || new.target_states) s where s not in (select code from public.states)) then
    raise exception 'unknown state' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(new.target_regions) r where r not in (select code from public.regions)) then
    raise exception 'unknown region' using errcode = '23514';
  end if;
  return new;
end $$;

grant update (about, founded_year, current_doors, current_states, current_channels, target_retailers, target_distributors,
  target_regions, target_states, target_channels, certifications, storage, timeline, commission_pref, max_rate, max_retainer,
  trade_budget_band, looking_for) on public.brand_profiles to authenticated;

-- Brokers a brand has messaged can read its profile.
drop policy brand_profiles_read on public.brand_profiles;
create policy brand_profiles_read on public.brand_profiles for select to authenticated using (
  public.is_brand_member_of(org_id) or public.is_admin()
  or (public.my_org_type() = 'broker' and public.shares_conversation_with(org_id))
);

-- Products
create table public.brand_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text check (description is null or char_length(description) <= 1000),
  size text check (size is null or char_length(size) <= 60),
  case_pack integer check (case_pack is null or case_pack between 1 and 1000),
  msrp numeric(10,2) check (msrp is null or msrp >= 0),
  wholesale numeric(10,2) check (wholesale is null or wholesale >= 0),
  upc text check (upc is null or upc ~ '^[0-9]{8,14}$'),
  shelf_life_days integer check (shelf_life_days is null or shelf_life_days between 1 and 3650),
  storage text check (storage is null or storage in ('ambient','refrigerated','frozen')),
  image_path text,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index brand_products_org on public.brand_products (org_id, sort);
create trigger brand_products_type before insert or update on public.brand_products for each row execute function public.check_brand_org('org_id');
create trigger brand_products_touch before update on public.brand_products for each row execute function public.touch_updated_at();

-- Data room
create table public.brand_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  folder text not null check (folder in ('Sell sheets','Decks','Product photos','Spec sheets','Pricing','Marketing','Other')),
  file_name text not null check (char_length(file_name) between 1 and 200),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index brand_files_org on public.brand_files (org_id, created_at desc);
create trigger brand_files_type before insert on public.brand_files for each row execute function public.check_brand_org('org_id');

alter table public.brand_products enable row level security;
alter table public.brand_files enable row level security;
revoke all on public.brand_products, public.brand_files from anon, authenticated;
grant select, insert, update, delete on public.brand_products to authenticated;
grant select, insert, delete on public.brand_files to authenticated;

create policy brand_products_read on public.brand_products for select to authenticated using (
  public.is_brand_member_of(org_id) or public.is_admin()
  or (public.my_org_type() = 'broker' and public.shares_conversation_with(org_id)));
create policy brand_products_write on public.brand_products for all to authenticated
  using (public.is_brand_member_of(org_id)) with check (public.is_brand_member_of(org_id));
create policy brand_files_read on public.brand_files for select to authenticated using (
  public.is_brand_member_of(org_id) or public.is_admin()
  or (public.my_org_type() = 'broker' and public.shares_conversation_with(org_id)));
create policy brand_files_insert on public.brand_files for insert to authenticated
  with check (public.is_brand_member_of(org_id) and created_by = auth.uid() and storage_path like org_id::text || '/%');
create policy brand_files_delete on public.brand_files for delete to authenticated using (public.is_brand_member_of(org_id));

-- Storage: brand-files/<org_id>/<uuid>.<ext>, 25 MB, private.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('brand-files', 'brand-files', false, 26214400, array[
      'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/csv',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
    execute $p$drop policy if exists bench_brand_files_read on storage.objects$p$;
    execute $p$create policy bench_brand_files_read on storage.objects for select to authenticated
      using (bucket_id = 'brand-files' and (
        public.is_brand_member_of(((storage.foldername(name))[1])::uuid) or public.is_admin()
        or (public.my_org_type() = 'broker' and public.shares_conversation_with(((storage.foldername(name))[1])::uuid))))$p$;
    execute $p$drop policy if exists bench_brand_files_write on storage.objects$p$;
    execute $p$create policy bench_brand_files_write on storage.objects for insert to authenticated
      with check (bucket_id = 'brand-files' and public.is_brand_member_of(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$drop policy if exists bench_brand_files_delete on storage.objects$p$;
    execute $p$create policy bench_brand_files_delete on storage.objects for delete to authenticated
      using (bucket_id = 'brand-files' and public.is_brand_member_of(((storage.foldername(name))[1])::uuid))$p$;
  end if;
end $$;

-- "Brands are seeking brokers for" now also counts brand profile targets
-- (same rule: an account shows only once 3+ distinct brands want it).
create or replace function public.public_demand(p_limit integer default 24)
returns table (kind text, id integer, name text, brands bigint)
language sql stable security definer set search_path = '' as $$
  with wants as (
    select 'retailer'::text as kind, r.id as item, b.brand_org_id as brand
      from public.briefs b cross join lateral unnest(b.target_retailers) as r(id) where b.archived_at is null
    union
    select 'distributor', d.id, b.brand_org_id
      from public.briefs b cross join lateral unnest(b.distributors) as d(id) where b.archived_at is null
    union
    select 'retailer', r.id, p.org_id from public.brand_profiles p cross join lateral unnest(p.target_retailers) as r(id)
    union
    select 'distributor', d.id, p.org_id from public.brand_profiles p cross join lateral unnest(p.target_distributors) as d(id)
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

-- Reference merges also repoint the new brand profile columns.
create or replace function public.merge_brand_profile_refs(p_table text, p_from integer, p_into integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_table = 'retailers' then
    update public.brand_profiles set target_retailers = array(select distinct unnest(array_replace(target_retailers, p_from, p_into))) where p_from = any(target_retailers);
  elsif p_table = 'distributors' then
    update public.brand_profiles set target_distributors = array(select distinct unnest(array_replace(target_distributors, p_from, p_into))) where p_from = any(target_distributors);
  elsif p_table = 'channels' then
    update public.brand_profiles set current_channels = array(select distinct unnest(array_replace(current_channels, p_from, p_into))),
      target_channels = array(select distinct unnest(array_replace(target_channels, p_from, p_into)))
     where p_from = any(current_channels) or p_from = any(target_channels);
  end if;
end $$;
revoke execute on function public.merge_brand_profile_refs(text, integer, integer) from public, anon, authenticated;
create or replace function public.reference_merged()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.merged_into is not null and old.merged_into is distinct from new.merged_into then
    perform public.merge_brand_profile_refs(tg_table_name, new.id, new.merged_into);
  end if;
  return new;
end $$;
create trigger retailers_merged after update of merged_into on public.retailers for each row execute function public.reference_merged();
create trigger distributors_merged after update of merged_into on public.distributors for each row execute function public.reference_merged();
create trigger channels_merged after update of merged_into on public.channels for each row execute function public.reference_merged();
