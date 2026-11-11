-- Purvey admins by email. An address on this list becomes an admin when its
-- account is created (first sign-in), or immediately if it already exists.
-- No client access: rows are added by Purvey through the database.
create table public.admin_allowlist (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table public.admin_allowlist enable row level security;
revoke all on public.admin_allowlist from anon, authenticated;

create or replace function public.apply_admin_allowlist()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.admin_allowlist where email = lower(new.email)) then
    new.is_admin := true;
  end if;
  return new;
end $$;
create trigger users_admin_allowlist before insert or update of email on public.users
  for each row execute function public.apply_admin_allowlist();

-- Adding an address to the list promotes an existing account at once.
create or replace function public.admin_allowlist_added()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.users set is_admin = true where lower(email) = new.email and not is_admin;
  return new;
end $$;
create trigger admin_allowlist_promote after insert on public.admin_allowlist
  for each row execute function public.admin_allowlist_added();

revoke execute on function public.apply_admin_allowlist(), public.admin_allowlist_added() from public, anon, authenticated;
