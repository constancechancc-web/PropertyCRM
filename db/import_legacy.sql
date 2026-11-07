-- One-off import of the old prototype data into the new tables.
-- The old tables were (id text, data jsonb): contacts, properties, leads, rentals.
-- schema.sql renames them to legacy_* first. If your old data lives in another database,
-- copy those four tables into this database (e.g. pg_dump -t ... | psql), run schema.sql,
-- then run this file:  npm run db:import-legacy
-- Does nothing if there are no legacy_* tables, and runs only once (see legacy_import_log).

create table if not exists public.legacy_import_log (
  ran_at timestamptz primary key default now(),
  contacts int, listings int, leads int, notes int, tenancies int, payments int
);

create or replace function pg_temp.lnum(v text) returns numeric language plpgsql immutable as $$
declare cleaned text := regexp_replace(coalesce(v, ''), '[^0-9.]', '', 'g');
begin
  if cleaned = '' or cleaned = '.' then return null; end if;
  return cleaned::numeric;
exception when others then return null;
end $$;

create or replace function pg_temp.ldate(v text) returns date language plpgsql immutable as $$
begin
  if v is null or btrim(v) = '' then return null; end if;
  return left(btrim(v), 10)::date;
exception when others then return null;
end $$;

create or replace function pg_temp.lts(v text) returns timestamptz language plpgsql immutable as $$
begin
  if v is null or btrim(v) = '' then return null; end if;
  return v::timestamptz;
exception when others then return null;
end $$;

create or replace function pg_temp.lstr(v text) returns text language sql immutable as $$
  select nullif(btrim(coalesce(v, '')), '')
$$;

create or replace function pg_temp.larr(v jsonb) returns text[] language sql immutable as $$
  select coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end)), '{}')
$$;

do $$
declare
  n_contacts int := 0; n_listings int := 0; n_leads int := 0; n_notes int := 0; n_ten int := 0; n_pay int := 0;
begin
  if exists (select 1 from public.legacy_import_log) then
    raise notice 'Legacy import already ran; skipping.';
    return;
  end if;

  create temp table map_ids (kind text, old_id text, new_id uuid, primary key (kind, old_id)) on commit drop;

  -- contacts -----------------------------------------------------------------
  if to_regclass('public.legacy_contacts') is not null then
    insert into map_ids select 'contact', id::text, gen_random_uuid() from public.legacy_contacts;

    insert into public.contacts (id, name, phone, race, roles, note)
    select m.new_id,
           coalesce(pg_temp.lstr(c.data ->> 'name'), '(No name)'),
           pg_temp.lstr(c.data ->> 'phone'),
           case initcap(btrim(coalesce(c.data ->> 'race', '')))
             when 'Chinese' then 'Chinese' when 'Malay' then 'Malay'
             when 'Indian' then 'Indian' when 'Others' then 'Others' when 'Other' then 'Others'
           end,
           coalesce(array(
             select distinct case lower(r) when 'co-agent' then 'agent' when 'coagent' then 'agent' else lower(r) end
             from unnest(pg_temp.larr(c.data -> 'roles')) r
             where lower(r) in ('owner', 'landlord', 'buyer', 'tenant', 'agent', 'co-agent', 'coagent')
           ), '{}'),
           pg_temp.lstr(c.data ->> 'note')
    from public.legacy_contacts c
    join map_ids m on m.kind = 'contact' and m.old_id = c.id::text;
    get diagnostics n_contacts = row_count;
  end if;

  -- properties -> listings ---------------------------------------------------
  if to_regclass('public.legacy_properties') is not null then
    insert into public.listings (address, deal, type, price, built_up_sqft, land_sqft, bedrooms, bathrooms,
                                 furnishing, tenure, status, owner_id, viewing_access, note)
    select coalesce(pg_temp.lstr(p.data ->> 'address'), '(No address)'),
           case when lower(p.data ->> 'deal') in ('rent', 'rental') then 'rent'
                when lower(p.data ->> 'deal') in ('sale', 'sell', 'buy') then 'sale' end,
           pg_temp.lstr(p.data ->> 'type'),
           pg_temp.lnum(p.data ->> 'price'),
           pg_temp.lnum(p.data ->> 'size'),
           pg_temp.lnum(p.data ->> 'land'),
           pg_temp.lnum(p.data ->> 'beds')::int,
           pg_temp.lnum(p.data ->> 'baths')::int,
           case lower(btrim(coalesce(p.data ->> 'furnish', '')))
             when 'unfurnished' then 'Unfurnished' when 'partly furnished' then 'Partly furnished'
             when 'partly' then 'Partly furnished' when 'fully furnished' then 'Fully furnished'
             when 'fully' then 'Fully furnished' end,
           case lower(btrim(coalesce(p.data ->> 'tenure', '')))
             when 'freehold' then 'Freehold' when 'leasehold' then 'Leasehold'
             when 'malay reserve' then 'Malay reserve' when 'bumi lot' then 'Bumi lot' end,
           case lower(btrim(coalesce(p.data ->> 'status', '')))
             when 'sold' then 'sold' when 'rented' then 'rented' when 'withdrawn' then 'withdrawn'
             else 'available' end,  -- includes the old 'offer'
           m.new_id,
           pg_temp.lstr(p.data ->> 'access'),
           pg_temp.lstr(p.data ->> 'note')
    from public.legacy_properties p
    left join map_ids m on m.kind = 'contact' and m.old_id = p.data ->> 'ownerId';
    get diagnostics n_listings = row_count;
  end if;

  -- leads + notes ------------------------------------------------------------
  if to_regclass('public.legacy_leads') is not null then
    insert into map_ids select 'lead', id::text, gen_random_uuid() from public.legacy_leads;

    insert into public.leads (id, contact_id, deal, property_types, areas, budget_min, budget_max, stage,
                              next_follow_up, source, timeline, lost_reason, last_contacted_at)
    select ml.new_id,
           mc.new_id,
           case when lower(l.data ->> 'deal') in ('rent', 'rental') then 'rent'
                when lower(l.data ->> 'deal') in ('sale', 'buy') then 'sale' end,
           pg_temp.larr(l.data -> 'ptypes'),
           pg_temp.lstr(l.data ->> 'areas'),
           pg_temp.lnum(l.data ->> 'budgetMin'),
           pg_temp.lnum(l.data ->> 'budgetMax'),
           coalesce((select s from unnest(array['New','Contacted','Viewing Set','Viewed','Negotiating','Booked','Closed','Lost']) s
                     where lower(s) = lower(btrim(coalesce(l.data ->> 'stage', ''))) limit 1), 'New'),
           pg_temp.ldate(l.data ->> 'nextFollowUp'),
           pg_temp.lstr(l.data ->> 'source'),
           pg_temp.lstr(l.data ->> 'moveIn'),
           pg_temp.lstr(l.data ->> 'lostReason'),
           pg_temp.lts(l.data ->> 'lastContactAt')
    from public.legacy_leads l
    join map_ids ml on ml.kind = 'lead' and ml.old_id = l.id::text
    left join map_ids mc on mc.kind = 'contact' and mc.old_id = l.data ->> 'contactId';
    get diagnostics n_leads = row_count;

    insert into public.lead_notes (lead_id, text, created_at)
    select ml.new_id, n ->> 'text', coalesce(pg_temp.lts(n ->> 'at'), now())
    from public.legacy_leads l
    join map_ids ml on ml.kind = 'lead' and ml.old_id = l.id::text
    cross join lateral jsonb_array_elements(case when jsonb_typeof(l.data -> 'notes') = 'array' then l.data -> 'notes' else '[]'::jsonb end) n
    where pg_temp.lstr(n ->> 'text') is not null;
    get diagnostics n_notes = row_count;
  end if;

  -- rentals -> tenancies + payments ------------------------------------------
  if to_regclass('public.legacy_rentals') is not null then
    insert into map_ids select 'rental', id::text, gen_random_uuid() from public.legacy_rentals;

    insert into public.tenancies (id, tenant_name, phone, address, start_date, end_date, pay_day, rent,
                                  account_holder, bank, account_number)
    select m.new_id,
           coalesce(pg_temp.lstr(r.data ->> 'tenant'), '(No name)'),
           pg_temp.lstr(r.data ->> 'phone'),
           pg_temp.lstr(r.data ->> 'address'),
           pg_temp.ldate(r.data ->> 'start'),
           pg_temp.ldate(r.data ->> 'end'),
           case when pg_temp.lnum(r.data ->> 'payDay') between 1 and 31 then pg_temp.lnum(r.data ->> 'payDay')::int end,
           pg_temp.lnum(r.data ->> 'rent'),
           pg_temp.lstr(r.data ->> 'accName'),
           pg_temp.lstr(r.data ->> 'bank'),
           pg_temp.lstr(r.data ->> 'accNo')
    from public.legacy_rentals r
    join map_ids m on m.kind = 'rental' and m.old_id = r.id::text;
    get diagnostics n_ten = row_count;

    insert into public.tenancy_payments (tenancy_id, month)
    select distinct m.new_id, pg_temp.ldate(pm || '-01')
    from public.legacy_rentals r
    join map_ids m on m.kind = 'rental' and m.old_id = r.id::text
    cross join lateral unnest(pg_temp.larr(r.data -> 'paidMonths')) pm
    where pg_temp.ldate(pm || '-01') is not null
    on conflict (tenancy_id, month) do nothing;
    get diagnostics n_pay = row_count;
  end if;

  insert into public.legacy_import_log (contacts, listings, leads, notes, tenancies, payments)
  values (n_contacts, n_listings, n_leads, n_notes, n_ten, n_pay);

  raise notice 'Imported % contacts, % listings, % leads, % notes, % tenancies, % paid months',
    n_contacts, n_listings, n_leads, n_notes, n_ten, n_pay;
end $$;
