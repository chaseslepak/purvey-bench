-- New channels, and free-text distributors on brand profiles for anyone not
-- on the reference list (shown to brokers as typed; Purvey can add them to
-- the list later from the admin console).
insert into public.channels (name, slug) values
  ('Hardware', 'hardware'),
  ('QVC & TV Shopping', 'qvc-tv-shopping'),
  ('Industrial & Safety', 'industrial-safety'),
  ('Office & Pantry', 'office-pantry')
on conflict (slug) do nothing;

alter table public.brand_profiles
  add column other_current_distributors text[] not null default '{}'
    check (cardinality(other_current_distributors) <= 20 and array_to_string(other_current_distributors, '') !~ '[<>]'),
  add column other_target_distributors text[] not null default '{}'
    check (cardinality(other_target_distributors) <= 20 and array_to_string(other_target_distributors, '') !~ '[<>]');

create or replace function public.check_other_distributors()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.other_current_distributors || new.other_target_distributors) x where char_length(trim(x)) not between 1 and 80) then
    raise exception 'distributor names must be 1 to 80 characters' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger brand_profiles_other_distributors before insert or update on public.brand_profiles
  for each row execute function public.check_other_distributors();

grant update (other_current_distributors, other_target_distributors) on public.brand_profiles to authenticated;
