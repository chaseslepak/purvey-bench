-- Deal room: shared progress board, toolbox and commission true-up for a
-- brand-broker conversation. Both parties read; who may write is enforced
-- per table. Admins have no access (same as messages).

create type public.deal_stage as enum ('targeted', 'pitched', 'samples_sent', 'category_review', 'authorized', 'on_shelf');
create type public.true_up_status as enum ('needed', 'report', 'invoiced', 'questioned', 'paid');

create or replace function public.is_conversation_broker(p_conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations c where c.id = p_conv and public.is_org_member(c.broker_org_id) and c.declined_at is null);
$$;
create or replace function public.is_conversation_brand(p_conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations c where c.id = p_conv and public.is_org_member(c.brand_org_id) and c.declined_at is null);
$$;

-- ---------------------------------------------------------------------------
-- Progress (CRM): accounts on a board, updates in a shared timeline.
-- ---------------------------------------------------------------------------
create table public.deal_accounts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  retailer_id integer references public.retailers(id),
  custom_name text check (custom_name is null or char_length(custom_name) between 1 and 120),
  stage public.deal_stage not null default 'targeted',
  stores integer check (stores is null or stores between 0 and 100000),
  covered boolean not null default true,  -- counts toward commission
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deal_accounts_one_kind check ((retailer_id is null) <> (custom_name is null))
);
create unique index deal_accounts_ref on public.deal_accounts (conversation_id, retailer_id) where retailer_id is not null;
create unique index deal_accounts_custom on public.deal_accounts (conversation_id, lower(custom_name)) where custom_name is not null;

create table public.deal_updates (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  account_id uuid not null references public.deal_accounts(id) on delete cascade,
  author_user_id uuid references public.users(id) on delete set null,
  from_stage public.deal_stage,
  to_stage public.deal_stage not null,
  note text not null check (char_length(note) between 1 and 4000),
  next_step text check (next_step is null or char_length(next_step) <= 300),
  due_date date,
  created_at timestamptz not null default now()
);
create index deal_updates_conv on public.deal_updates (conversation_id, created_at desc);

create table public.deal_update_thanks (
  update_id uuid not null references public.deal_updates(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (update_id, org_id)
);

-- An update moves its account to the new stage; the account must be in the same thread.
create or replace function public.deal_updates_apply()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.deal_accounts;
begin
  select * into a from public.deal_accounts where id = new.account_id for update;
  if a.conversation_id <> new.conversation_id then
    raise exception 'account is not in this conversation' using errcode = '23514';
  end if;
  new.from_stage := a.stage;
  new.created_at := clock_timestamp();
  update public.deal_accounts set stage = new.to_stage, updated_at = now() where id = a.id;
  return new;
end $$;
create trigger deal_updates_apply before insert on public.deal_updates for each row execute function public.deal_updates_apply();

-- The brand team hears about every progress update (honours prefs and mute).
create or replace function public.deal_updates_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.conversations; v_acct text;
begin
  select * into c from public.conversations where id = new.conversation_id;
  if exists (select 1 from public.conversation_sides where conversation_id = c.id and org_id = c.brand_org_id and muted) then return new; end if;
  select coalesce(a.custom_name, r.name) into v_acct from public.deal_accounts a left join public.retailers r on r.id = a.retailer_id where a.id = new.account_id;
  insert into public.email_outbox (to_user_id, kind, payload, digest)
  select m.user_id, 'deal_update',
         jsonb_build_object('conversation_id', c.id, 'from_org', (select name from public.organizations where id = c.broker_org_id),
                            'account', v_acct, 'to_stage', new.to_stage, 'excerpt', left(new.note, 400)),
         coalesce(p.email_new_message, 'instant') = 'daily'
    from public.org_members m left join public.notification_prefs p on p.user_id = m.user_id
   where m.org_id = c.brand_org_id and coalesce(p.email_new_message, 'instant') <> 'off'
     and not public.email_opted_out(m.user_id, 'deal_update');
  return new;
end $$;
create trigger deal_updates_email after insert on public.deal_updates for each row execute function public.deal_updates_email();

-- ---------------------------------------------------------------------------
-- Toolbox: files either side shares with the other, plus "opened by" events.
-- ---------------------------------------------------------------------------
create table public.toolbox_files (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,  -- uploader's org
  folder text not null check (folder in ('Sell sheets', 'Decks', 'Pricing', 'Spec sheets', 'Retail photos', 'Reports', 'Other')),
  file_name text not null check (char_length(file_name) between 1 and 200),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 26214400),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index toolbox_files_conv on public.toolbox_files (conversation_id, created_at desc);

create table public.toolbox_file_events (
  id bigint generated by default as identity primary key,
  file_id uuid not null references public.toolbox_files(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index toolbox_file_events_file on public.toolbox_file_events (file_id, created_at desc);

-- Record that the caller opened a file (once per org per hour is enough).
create or replace function public.log_toolbox_open(p_file uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.toolbox_files;
begin
  select * into f from public.toolbox_files where id = p_file;
  if not found or not public.is_conversation_party(f.conversation_id) then raise exception 'not found' using errcode = '42501'; end if;
  if f.org_id = public.my_org_id() then return; end if;
  if not exists (select 1 from public.toolbox_file_events where file_id = p_file and org_id = public.my_org_id() and created_at > now() - interval '1 hour') then
    insert into public.toolbox_file_events (file_id, org_id) values (p_file, public.my_org_id());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Commission true-up: agreed terms, then one row per month.
-- The brand uploads the sales report and marks invoices paid; the broker
-- reviews, adjusts and invoices. Payment happens outside Bench.
-- ---------------------------------------------------------------------------
create table public.deal_terms (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  rate numeric(5,2) not null default 0 check (rate between 0 and 100),
  retainer numeric(10,2) not null default 0 check (retainer >= 0),
  retainer_from date,
  retainer_to date,
  invoice_due_days smallint not null default 30 check (invoice_due_days between 0 and 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.commission_periods (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  status public.true_up_status not null default 'needed',
  report_path text,
  report_name text,
  report_uploaded_by uuid references public.users(id) on delete set null,
  report_uploaded_at timestamptz,
  lines jsonb not null default '[]',        -- [{account, distributor, units, gross, deductions, covered, note}]
  adjustments jsonb not null default '[]',  -- [{label, amount}]
  invoice_no text,
  invoice_date date,
  due_date date,
  totals jsonb,                             -- frozen at invoicing: {covered_net, commission, retainer, adjustments, total}
  questioned_note text,
  paid_date date,
  paid_method text check (paid_method is null or paid_method in ('ACH', 'Check', 'Wire', 'Other')),
  paid_ref text check (paid_ref is null or char_length(paid_ref) <= 80),
  paid_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, period)
);

create or replace function public.commission_totals(p public.commission_periods)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.deal_terms; v_net numeric := 0; v_adj numeric := 0; v_ret numeric := 0; l jsonb; a jsonb;
begin
  select * into t from public.deal_terms where conversation_id = p.conversation_id;
  for l in select * from jsonb_array_elements(p.lines) loop
    if coalesce((l ->> 'covered')::boolean, false) then
      v_net := v_net + coalesce((l ->> 'gross')::numeric, 0) - coalesce((l ->> 'deductions')::numeric, 0);
    end if;
  end loop;
  for a in select * from jsonb_array_elements(p.adjustments) loop v_adj := v_adj + coalesce((a ->> 'amount')::numeric, 0); end loop;
  if t.retainer > 0 and (t.retainer_from is null or p.period >= date_trunc('month', t.retainer_from)::date)
     and (t.retainer_to is null or p.period <= date_trunc('month', t.retainer_to)::date) then
    v_ret := t.retainer;
  end if;
  return jsonb_build_object(
    'covered_net', round(v_net, 2),
    'commission', round(v_net * coalesce(t.rate, 0) / 100, 2),
    'retainer', round(v_ret, 2),
    'adjustments', round(v_adj, 2),
    'total', round(v_net * coalesce(t.rate, 0) / 100 + v_ret + v_adj, 2));
end $$;

-- Validate report lines and adjustments wherever they're written.
create or replace function public.commission_periods_check()
returns trigger language plpgsql set search_path = '' as $$
declare l jsonb;
begin
  if jsonb_typeof(new.lines) <> 'array' or jsonb_array_length(new.lines) > 2000 then raise exception 'invalid report lines' using errcode = '23514'; end if;
  for l in select * from jsonb_array_elements(new.lines) loop
    if coalesce(l ->> 'account', '') = '' or (l ->> 'gross') !~ '^-?[0-9]+(\.[0-9]+)?$' or (l ->> 'deductions') !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception 'invalid report line' using errcode = '23514';
    end if;
  end loop;
  if jsonb_typeof(new.adjustments) <> 'array' or jsonb_array_length(new.adjustments) > 50 then raise exception 'invalid adjustments' using errcode = '23514'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger commission_periods_check before insert or update on public.commission_periods for each row execute function public.commission_periods_check();

-- Brand: record the month's sales report (lines parsed by the server from the uploaded file).
create or replace function public.true_up_upload_report(p_conv uuid, p_period date, p_path text, p_name text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_status public.true_up_status;
begin
  if not public.is_conversation_brand(p_conv) then raise exception 'only the brand uploads sales reports' using errcode = '42501'; end if;
  if p_path not like p_conv::text || '/%' then raise exception 'invalid report path' using errcode = '23514'; end if;
  select status into v_status from public.commission_periods where conversation_id = p_conv and period = date_trunc('month', p_period)::date;
  if v_status in ('invoiced', 'paid') then raise exception 'this month is already invoiced' using errcode = '23514'; end if;
  insert into public.commission_periods (conversation_id, period, status, report_path, report_name, report_uploaded_by, report_uploaded_at, lines)
  values (p_conv, date_trunc('month', p_period)::date, 'report', p_path, p_name, auth.uid(), now(), p_lines)
  on conflict (conversation_id, period) do update set status = 'report', report_path = excluded.report_path, report_name = excluded.report_name,
    report_uploaded_by = excluded.report_uploaded_by, report_uploaded_at = now(), lines = excluded.lines, invoice_no = null, invoice_date = null,
    due_date = null, totals = null, questioned_note = null
  returning id into v_id;
  perform public.true_up_notify(v_id, 'true_up_report');
  return v_id;
end $$;

-- Broker: mark lines covered/not covered and add adjustments before invoicing.
create or replace function public.true_up_edit(p_period uuid, p_lines jsonb, p_adjustments jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.commission_periods;
begin
  select * into p from public.commission_periods where id = p_period for update;
  if not found or not public.is_conversation_broker(p.conversation_id) then raise exception 'only the broker edits the true-up' using errcode = '42501'; end if;
  if p.status not in ('report', 'questioned') then raise exception 'this month can''t be edited now' using errcode = '23514'; end if;
  -- The broker may change coverage flags only, never the brand's sales figures.
  if jsonb_array_length(p_lines) <> jsonb_array_length(p.lines) or exists (
       select 1 from jsonb_array_elements(p.lines) with ordinality o(l, i)
         join jsonb_array_elements(p_lines) with ordinality n(l, i) using (i)
        where (o.l - 'covered') <> (n.l - 'covered')) then
    raise exception 'sales figures come from the brand''s report and can''t be changed' using errcode = '23514';
  end if;
  update public.commission_periods set lines = p_lines, adjustments = p_adjustments, status = 'report' where id = p_period;
end $$;

-- Broker: issue the invoice. Totals are computed and frozen here.
create or replace function public.true_up_invoice(p_period uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.commission_periods; c public.conversations; t public.deal_terms; v_no text; v_seq int;
begin
  select * into p from public.commission_periods where id = p_period for update;
  if not found or not public.is_conversation_broker(p.conversation_id) then raise exception 'only the broker invoices' using errcode = '42501'; end if;
  if p.status not in ('report', 'questioned') then raise exception 'upload the sales report first' using errcode = '23514'; end if;
  select * into c from public.conversations where id = p.conversation_id;
  select * into t from public.deal_terms where conversation_id = p.conversation_id;
  select count(*) + 1 into v_seq from public.commission_periods cp join public.conversations cc on cc.id = cp.conversation_id
   where cc.broker_org_id = c.broker_org_id and cp.invoice_no is not null;
  v_no := upper(left(regexp_replace((select slug from public.organizations where id = c.broker_org_id), '[^a-z]', '', 'g'), 3)) || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 3, '0');
  update public.commission_periods set status = 'invoiced', invoice_no = v_no, invoice_date = current_date,
    due_date = current_date + coalesce(t.invoice_due_days, 30), totals = public.commission_totals(p), questioned_note = null
   where id = p_period;
  perform public.true_up_notify(p_period, 'true_up_invoiced');
  return v_no;
end $$;

-- Brand: question an invoice, or record payment made outside Bench.
create or replace function public.true_up_question(p_period uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.commission_periods;
begin
  select * into p from public.commission_periods where id = p_period for update;
  if not found or not public.is_conversation_brand(p.conversation_id) then raise exception 'only the brand can question an invoice' using errcode = '42501'; end if;
  if p.status <> 'invoiced' then raise exception 'nothing to question' using errcode = '23514'; end if;
  update public.commission_periods set status = 'questioned', questioned_note = left(trim(p_note), 1000) where id = p_period;
  perform public.true_up_notify(p_period, 'true_up_questioned');
end $$;

create or replace function public.true_up_mark_paid(p_period uuid, p_date date, p_method text, p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.commission_periods;
begin
  select * into p from public.commission_periods where id = p_period for update;
  if not found or not public.is_conversation_brand(p.conversation_id) then raise exception 'only the brand marks invoices paid' using errcode = '42501'; end if;
  if p.status <> 'invoiced' then raise exception 'there is no open invoice' using errcode = '23514'; end if;
  update public.commission_periods set status = 'paid', paid_date = p_date, paid_method = p_method, paid_ref = nullif(trim(p_ref), ''), paid_by = auth.uid() where id = p_period;
  perform public.true_up_notify(p_period, 'true_up_paid');
end $$;

-- Email the other side about a true-up step.
create or replace function public.true_up_notify(p_period uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.commission_periods; c public.conversations; v_to uuid;
begin
  select * into p from public.commission_periods where id = p_period;
  select * into c from public.conversations where id = p.conversation_id;
  v_to := case when p_kind in ('true_up_report', 'true_up_questioned', 'true_up_paid') then c.broker_org_id else c.brand_org_id end;
  insert into public.email_outbox (to_user_id, kind, payload)
  select m.user_id, p_kind, jsonb_build_object('conversation_id', c.id, 'period', to_char(p.period, 'FMMonth YYYY'),
           'invoice_no', p.invoice_no, 'total', p.totals ->> 'total', 'note', p.questioned_note,
           'from_org', (select name from public.organizations where id = case when v_to = c.broker_org_id then c.brand_org_id else c.broker_org_id end))
    from public.org_members m where m.org_id = v_to and not public.email_opted_out(m.user_id, p_kind);
end $$;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
revoke all on public.deal_accounts, public.deal_updates, public.deal_update_thanks, public.toolbox_files,
  public.toolbox_file_events, public.deal_terms, public.commission_periods from anon, authenticated;
grant select on public.deal_accounts, public.deal_updates, public.deal_update_thanks, public.toolbox_files,
  public.toolbox_file_events, public.deal_terms, public.commission_periods to authenticated;
grant insert, delete on public.deal_accounts to authenticated;
grant update (stage, stores, covered) on public.deal_accounts to authenticated;
grant insert on public.deal_updates to authenticated;
grant insert, delete on public.deal_update_thanks to authenticated;
grant insert, delete on public.toolbox_files to authenticated;
grant insert, update on public.deal_terms to authenticated;

alter table public.deal_accounts enable row level security;
alter table public.deal_updates enable row level security;
alter table public.deal_update_thanks enable row level security;
alter table public.toolbox_files enable row level security;
alter table public.toolbox_file_events enable row level security;
alter table public.deal_terms enable row level security;
alter table public.commission_periods enable row level security;

create policy deal_read on public.deal_accounts for select to authenticated using (public.is_conversation_party(conversation_id));
create policy deal_broker_insert on public.deal_accounts for insert to authenticated with check (public.is_conversation_broker(conversation_id));
create policy deal_broker_update on public.deal_accounts for update to authenticated using (public.is_conversation_broker(conversation_id)) with check (public.is_conversation_broker(conversation_id));
create policy deal_broker_delete on public.deal_accounts for delete to authenticated using (public.is_conversation_broker(conversation_id));

create policy updates_read on public.deal_updates for select to authenticated using (public.is_conversation_party(conversation_id));
create policy updates_broker_insert on public.deal_updates for insert to authenticated
  with check (public.is_conversation_broker(conversation_id) and author_user_id = auth.uid());

create policy thanks_read on public.deal_update_thanks for select to authenticated
  using (exists (select 1 from public.deal_updates u where u.id = update_id and public.is_conversation_party(u.conversation_id)));
create policy thanks_brand_insert on public.deal_update_thanks for insert to authenticated
  with check (org_id = public.my_org_id() and user_id = auth.uid()
              and exists (select 1 from public.deal_updates u where u.id = update_id and public.is_conversation_brand(u.conversation_id)));
create policy thanks_brand_delete on public.deal_update_thanks for delete to authenticated using (org_id = public.my_org_id());

create policy toolbox_read on public.toolbox_files for select to authenticated using (public.is_conversation_party(conversation_id));
create policy toolbox_insert on public.toolbox_files for insert to authenticated
  with check (public.is_conversation_party(conversation_id) and org_id = public.my_org_id() and created_by = auth.uid()
              and storage_path like conversation_id::text || '/%');
create policy toolbox_delete on public.toolbox_files for delete to authenticated using (public.is_org_member(org_id));
create policy toolbox_events_read on public.toolbox_file_events for select to authenticated
  using (exists (select 1 from public.toolbox_files f where f.id = file_id and public.is_conversation_party(f.conversation_id)));

create policy terms_read on public.deal_terms for select to authenticated using (public.is_conversation_party(conversation_id));
create policy terms_broker_insert on public.deal_terms for insert to authenticated with check (public.is_conversation_broker(conversation_id));
create policy terms_broker_update on public.deal_terms for update to authenticated using (public.is_conversation_broker(conversation_id)) with check (public.is_conversation_broker(conversation_id));

create policy periods_read on public.commission_periods for select to authenticated using (public.is_conversation_party(conversation_id));
-- All writes go through the true_up_* functions.

revoke execute on function public.is_conversation_broker(uuid), public.is_conversation_brand(uuid), public.log_toolbox_open(uuid),
  public.commission_totals(public.commission_periods), public.true_up_upload_report(uuid, date, text, text, jsonb),
  public.true_up_edit(uuid, jsonb, jsonb), public.true_up_invoice(uuid), public.true_up_question(uuid, text),
  public.true_up_mark_paid(uuid, date, text, text), public.true_up_notify(uuid, text) from public, anon;
revoke execute on function public.true_up_notify(uuid, text) from authenticated;
grant execute on function public.is_conversation_broker(uuid), public.is_conversation_brand(uuid), public.log_toolbox_open(uuid),
  public.commission_totals(public.commission_periods), public.true_up_upload_report(uuid, date, text, text, jsonb),
  public.true_up_edit(uuid, jsonb, jsonb), public.true_up_invoice(uuid), public.true_up_question(uuid, text),
  public.true_up_mark_paid(uuid, date, text, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('toolbox', 'toolbox', false, 26214400, array[
      'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/csv',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
    execute $p$drop policy if exists bench_toolbox_read on storage.objects$p$;
    execute $p$create policy bench_toolbox_read on storage.objects for select to authenticated
      using (bucket_id = 'toolbox' and public.is_conversation_party(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$drop policy if exists bench_toolbox_write on storage.objects$p$;
    execute $p$create policy bench_toolbox_write on storage.objects for insert to authenticated
      with check (bucket_id = 'toolbox' and public.is_conversation_party(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$drop policy if exists bench_toolbox_delete on storage.objects$p$;
    execute $p$create policy bench_toolbox_delete on storage.objects for delete to authenticated
      using (bucket_id = 'toolbox' and public.is_conversation_party(((storage.foldername(name))[1])::uuid)
             and (owner_id = auth.uid()::text or owner = auth.uid()))$p$;
  end if;
end $$;
