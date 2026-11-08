-- The audit log is append-only, so a foreign key from it to users (which
-- would null the actor on delete) made anyone who ever took an admin action
-- impossible to delete. Keep the actor's id and email as a permanent
-- snapshot instead, with no foreign key.
alter table public.audit_log drop constraint if exists audit_log_actor_user_id_fkey;
alter table public.audit_log add column if not exists actor_email text;

create or replace function public.write_audit(p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_user_id, actor_email, action, target_type, target_id, details)
  values (auth.uid(), (select email from public.users where id = auth.uid()), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'));
$$;
