-- "Add your own" on every pick list: free-text names for anything not on the
-- reference lists. Shown as typed; Purvey can add them to the lists later.
create or replace function public.valid_other_names(a text[])
returns boolean language sql immutable set search_path = '' as $$
  select a is not null and cardinality(a) <= 20
     and not exists (select 1 from unnest(a) x where char_length(btrim(x)) not between 1 and 80 or x ~ '[<>]');
$$;

alter table public.brand_profiles
  add column if not exists other_current_retailers text[] not null default '{}' check (public.valid_other_names(other_current_retailers)),
  add column if not exists other_target_retailers text[] not null default '{}' check (public.valid_other_names(other_target_retailers)),
  add column if not exists other_current_channels text[] not null default '{}' check (public.valid_other_names(other_current_channels)),
  add column if not exists other_target_channels text[] not null default '{}' check (public.valid_other_names(other_target_channels)),
  add column if not exists other_categories text[] not null default '{}' check (public.valid_other_names(other_categories));

grant update (other_current_retailers, other_target_retailers, other_current_channels, other_target_channels, other_categories)
  on public.brand_profiles to authenticated;

alter table public.broker_listings
  add column if not exists other_channels text[] not null default '{}' check (public.valid_other_names(other_channels)),
  add column if not exists other_distributors text[] not null default '{}' check (public.valid_other_names(other_distributors)),
  add column if not exists other_categories text[] not null default '{}' check (public.valid_other_names(other_categories)),
  add column if not exists other_conflicts text[] not null default '{}' check (public.valid_other_names(other_conflicts));

grant update (other_channels, other_distributors, other_categories, other_conflicts) on public.broker_listings to authenticated;
