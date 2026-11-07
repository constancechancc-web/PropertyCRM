-- Optional example records (is_example = true). Load with `npm run db:seed-examples`.
-- Remove them any time with "Remove Examples" on the Today page (admin only).

insert into public.contacts (id, name, phone, race, roles, note, is_example) values
  ('00000000-0000-4000-8000-000000000001', 'Max Lim', '012-7119657', 'Chinese', '{tenant}', 'Looking for a shop facing main road.', true),
  ('00000000-0000-4000-8000-000000000002', 'Mr Lim', '012-3456789', 'Chinese', '{owner}', null, true),
  ('00000000-0000-4000-8000-000000000003', 'Ms Tan', '016-888 9999', 'Chinese', '{landlord}', null, true),
  ('00000000-0000-4000-8000-000000000004', 'Aisyah Rahman', '013-552 1188', 'Malay', '{buyer}', 'First home buyer.', true),
  ('00000000-0000-4000-8000-000000000005', 'Ravi Kumar', '017-220 4455', 'Indian', '{tenant}', null, true),
  ('00000000-0000-4000-8000-000000000006', '陈先生', '012-777 8888', 'Chinese', '{buyer}', null, true)
on conflict (id) do nothing;

insert into public.listings (id, deal, address, type, price, built_up_sqft, land_sqft, bedrooms, bathrooms,
                             furnishing, tenure, status, owner_id, viewing_access, note, is_example) values
  ('00000000-0000-4000-8001-000000000001', 'sale', 'Jalan Austin Perdana 2/8, Taman Mount Austin, 81100 Johor Bahru',
   '2 / 2.5 Storey Terrace House', 680000, 1650, 1540, 4, 3, 'Partly furnished', 'Freehold', 'available',
   '00000000-0000-4000-8000-000000000002', 'Call owner one day before', null, true),
  ('00000000-0000-4000-8001-000000000002', 'rent', 'Residensi Tebrau, Jalan Tebrau, 80250 Johor Bahru',
   'Condo / Apartment', 1800, 1100, null, 3, 2, 'Fully furnished', 'Leasehold', 'available',
   '00000000-0000-4000-8000-000000000003', 'Keys with guardhouse', null, true),
  ('00000000-0000-4000-8001-000000000003', 'rent', 'Jalan Cemerlang 12, Taman Desa Cemerlang, 81800 Ulu Tiram',
   'Shop', 2800, 1540, 1540, null, 1, 'Unfurnished', 'Freehold', 'available',
   '00000000-0000-4000-8000-000000000002', null, 'Facing main road', true)
on conflict (id) do nothing;

insert into public.leads (id, contact_id, deal, property_types, areas, budget_min, budget_max, stage,
                          next_follow_up, source, timeline, is_example) values
  ('00000000-0000-4000-8002-000000000001', '00000000-0000-4000-8000-000000000001', 'rent', '{Shop}',
   'Desa Cemerlang', 2500, 3000, 'Contacted', current_date, 'Facebook', 'Next month', true),
  ('00000000-0000-4000-8002-000000000002', '00000000-0000-4000-8000-000000000004', 'sale',
   '{"1 / 1.5 Storey Terrace House","2 / 2.5 Storey Terrace House"}', 'Mount Austin, Tebrau', null, 700000,
   'Viewing Set', current_date - 2, 'PropertyGuru', 'Within 3 months', true),
  ('00000000-0000-4000-8002-000000000003', '00000000-0000-4000-8000-000000000005', 'rent', '{"Condo / Apartment"}',
   'Tebrau', 1500, 2000, 'New', current_date + 3, 'Mudah', 'December 2026', true),
  ('00000000-0000-4000-8002-000000000004', '00000000-0000-4000-8000-000000000006', 'sale',
   '{"2 / 2.5 Storey Terrace House"}', 'Skudai', null, 600000, 'New', null, 'XiaoHongShu', null, true)
on conflict (id) do nothing;

insert into public.lead_notes (id, lead_id, text) values
  ('00000000-0000-4000-8004-000000000001', '00000000-0000-4000-8002-000000000001', 'Facing main road'),
  ('00000000-0000-4000-8004-000000000002', '00000000-0000-4000-8002-000000000002', 'Wants to view on weekend.')
on conflict (id) do nothing;

insert into public.tenancies (id, tenant_name, phone, address, start_date, end_date, pay_day, rent,
                              account_holder, bank, account_number, is_example) values
  ('00000000-0000-4000-8003-000000000001', 'Ravi Kumar', '017-220 4455',
   'A-18-05, Residensi Example, Jalan Tebrau, 80250 Johor Bahru', '2026-03-20', '2027-03-19', 20, 1800,
   'Lim Ah Kow', 'Public Bank', '12345678910', true)
on conflict (id) do nothing;
