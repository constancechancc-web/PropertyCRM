-- Constance CRM: PostgreSQL schema, roles, Row Level Security and change log.
-- Idempotent: safe to run again after updates (`npm run db:migrate`).
--
-- How permissions work:
--   * The API connects as the database owner, but every request runs inside a
--     transaction that switches to the limited role `crm_app` and stores the
--     signed-in email in the setting `app.email`.
--   * `crm_app` is not the owner of any table, so Row Level Security applies to it.
--   * my_role() reads app_roles for that email. Select/insert/update need a role;
--     delete needs 'admin'.

-- gen_random_uuid() is built into PostgreSQL 13+, no extension needed.

-- ---------------------------------------------------------------------------
-- 0. Move old prototype tables (id text, data jsonb) out of the way
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['contacts', 'properties', 'leads', 'rentals'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'data' and data_type = 'jsonb'
    ) and to_regclass('public.legacy_' || t) is null then
      execute format('alter table public.%I rename to %I', t, 'legacy_' || t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The limited role every API request runs as
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'crm_app') then
    create role crm_app nologin;
  end if;
  -- The API's connection must be able to SET ROLE crm_app. On PostgreSQL 16+ (Neon),
  -- creating a role does not give that right automatically, so grant it explicitly.
  if current_setting('server_version_num')::int >= 160000 then
    if not pg_has_role(current_user, 'crm_app', 'SET') then
      execute format('grant crm_app to %I with set true, inherit false', current_user);
    end if;
  elsif not pg_has_role(current_user, 'crm_app', 'member') then
    execute format('grant crm_app to %I', current_user);
  end if;
end $$;

grant usage on schema public to crm_app;

-- ---------------------------------------------------------------------------
-- 2. Users (login) and roles (who may use the CRM)
-- ---------------------------------------------------------------------------
create table if not exists public.app_users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  password_hash  text not null,
  created_at     timestamptz not null default now()
);
create unique index if not exists app_users_email_lower on public.app_users (lower(email));
-- Only the owner connection (login code, user scripts) touches app_users.
revoke all on table public.app_users from crm_app;

create table if not exists public.app_roles (
  email  text primary key,
  role   text not null check (role in ('admin', 'staff'))
);
alter table public.app_roles enable row level security;
revoke all on table public.app_roles from crm_app;
grant select on table public.app_roles to crm_app;
drop policy if exists app_roles_read_own on public.app_roles;
create policy app_roles_read_own on public.app_roles
  for select to crm_app
  using (lower(email) = lower(coalesce(current_setting('app.email', true), '')));
-- No insert/update/delete policies: manage roles with `npm run user:add` or SQL as the owner.

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.role
  from public.app_roles r
  where lower(r.email) = lower(nullif(current_setting('app.email', true), ''))
  limit 1
$$;
revoke all on function public.my_role() from public;
grant execute on function public.my_role() to crm_app;

create or replace function public.current_app_user()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;
grant execute on function public.current_app_user() to crm_app;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Data tables
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.app_users(id) on delete set null default public.current_app_user(),
  name        text not null,
  phone       text,
  race        text check (race in ('Chinese', 'Malay', 'Indian', 'Others')),
  roles       text[] not null default '{}'
              check (roles <@ array['owner', 'landlord', 'buyer', 'tenant', 'agent']::text[]),
  note        text,
  is_example  boolean not null default false
);

create table if not exists public.listings (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.app_users(id) on delete set null default public.current_app_user(),
  deal            text check (deal in ('sale', 'rent')),
  address         text not null,
  type            text,
  price           numeric,
  built_up_sqft   numeric,
  land_sqft       numeric,
  bedrooms        int,
  bathrooms       int,
  furnishing      text check (furnishing in ('Unfurnished', 'Partly furnished', 'Fully furnished')),
  tenure          text check (tenure in ('Freehold', 'Leasehold', 'Malay reserve', 'Bumi lot')),
  status          text not null default 'available' check (status in ('available', 'sold', 'rented', 'withdrawn')),
  owner_id        uuid references public.contacts(id) on delete set null,
  viewing_access  text,
  note            text,
  is_example      boolean not null default false
);

create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.app_users(id) on delete set null default public.current_app_user(),
  contact_id         uuid references public.contacts(id) on delete set null,
  deal               text check (deal in ('sale', 'rent')),
  property_types     text[] not null default '{}',
  areas              text,
  budget_min         numeric,
  budget_max         numeric,
  stage              text not null default 'New'
                     check (stage in ('New', 'Contacted', 'Viewing Set', 'Viewed', 'Negotiating', 'Booked', 'Closed', 'Lost')),
  next_follow_up     date,
  source             text,
  timeline           text,
  lost_reason        text,
  last_contacted_at  timestamptz,
  is_example         boolean not null default false
);

create table if not exists public.lead_notes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.app_users(id) on delete set null default public.current_app_user(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  text        text not null
);

create table if not exists public.tenancies (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.app_users(id) on delete set null default public.current_app_user(),
  tenant_name     text not null,
  phone           text,
  address         text,
  start_date      date,
  end_date        date,
  pay_day         int check (pay_day between 1 and 31),
  rent            numeric,
  account_holder  text,
  bank            text,
  account_number  text,
  is_example      boolean not null default false
);

-- "paid" lets staff undo a payment with an update, since staff cannot delete rows.
create table if not exists public.tenancy_payments (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.app_users(id) on delete set null default public.current_app_user(),
  tenancy_id  uuid not null references public.tenancies(id) on delete cascade,
  month       date not null check (extract(day from month) = 1),
  paid        boolean not null default true,
  unique (tenancy_id, month)
);

create index if not exists listings_owner_idx on public.listings (owner_id);
create index if not exists leads_contact_idx on public.leads (contact_id);
create index if not exists lead_notes_lead_idx on public.lead_notes (lead_id);
create index if not exists tenancy_payments_tenancy_idx on public.tenancy_payments (tenancy_id);

-- ---------------------------------------------------------------------------
-- 4. Change log: lets each browser pick up the other user's edits within seconds
-- ---------------------------------------------------------------------------
create table if not exists public.change_log (
  seq     bigserial primary key,
  tbl     text not null,
  row_id  uuid not null,
  op      text not null check (op in ('upsert', 'delete')),
  at      timestamptz not null default now()
);
create index if not exists change_log_at_idx on public.change_log (at);
alter table public.change_log enable row level security;
revoke all on table public.change_log from crm_app;
grant select on table public.change_log to crm_app;
drop policy if exists change_log_select on public.change_log;
create policy change_log_select on public.change_log for select to crm_app using (public.my_role() is not null);

create or replace function public.log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.change_log (tbl, row_id, op) values (tg_table_name, old.id, 'delete');
    return old;
  end if;
  insert into public.change_log (tbl, row_id, op) values (tg_table_name, new.id, 'upsert');
  -- keep the log small
  delete from public.change_log where at < now() - interval '2 days';
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Triggers, grants and RLS on every data table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['contacts', 'listings', 'leads', 'lead_notes', 'tenancies', 'tenancy_payments'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
    execute format('drop trigger if exists %I on public.%I', t || '_log', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_change()', t || '_log', t);

    execute format('revoke all on table public.%I from crm_app', t);
    execute format('grant select, insert, update, delete on table public.%I to crm_app', t);
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to crm_app using (public.my_role() is not null)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to crm_app with check (public.my_role() is not null)', t || '_insert', t);
    execute format('create policy %I on public.%I for update to crm_app using (public.my_role() is not null) with check (public.my_role() is not null)', t || '_update', t);
    execute format('create policy %I on public.%I for delete to crm_app using (public.my_role() = ''admin'')', t || '_delete', t);
  end loop;
end $$;

grant usage, select on sequence public.change_log_seq_seq to crm_app;
