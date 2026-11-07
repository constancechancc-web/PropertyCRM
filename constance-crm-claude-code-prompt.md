# Build "Constance CRM": a property agent CRM web app

You are building a production web app for **Constance Chan**, a property agent in Johor Bahru, Malaysia (REN number PEA3963, agency The Roof Realty / E.A.G). It is a private CRM for **two users** to record leads (buyers and tenants), listings with their owners, contacts, and monthly rent reminders. Read this whole brief before writing code, then work through the build order at the end, and check off the acceptance tests as you go.

Ask me before you change anything listed under "Fixed decisions". Everything else is your call; keep it simple and readable.

---

## 1. Fixed decisions

- **Stack:** Vite + React + TypeScript, Tailwind CSS, Supabase (Postgres, Auth, Realtime) via `@supabase/supabase-js` v2. No other backend.
- **Hosting:** static build deployable to Netlify or Vercel. Supabase URL and anon key come from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` (add `.env.example`; never commit real keys; never use the service_role key in the app).
- **Language:** the whole UI is in **English only**. No Chinese words anywhere in the interface.
- **Dates:** show dates with the year, written out: **"31 October 2026"**. Today page header: "Saturday, 7 November 2026". Note timestamps: "31 October 2026 · 3:32 pm". Exception: the rent reminder message uses `20/03/2026` (see §8).
- **Money:** Malaysian Ringgit. Short form on cards: `RM 680k`, `RM 1.2 mil`, `RM 1,800 /mo`. Full form in details and exports: `RM 680,000`. Use a period for decimals (`72.52%`), never a comma.
- **Phone numbers:** stored as typed (e.g. `012-345 6789`). For WhatsApp links, normalise to digits with country code `60` (`012-3456789` → `60123456789`, `+60 12-345 6789` → `60123456789`) and link to `https://wa.me/<digits>?text=<encoded>`.
- **Mobile first:** must work well at 400 px wide (she uses it on her phone between viewings) and on desktop.
- **Buttons and labels:** every button uses Title Case: "New Lead", "Save Changes", "Mark Paid For November", "+3 Days".

---

## 2. Users and permissions (enforced in the database, not only in the UI)

| Role | Who | Can |
|---|---|---|
| `admin` | Constance | Everything: view, add, edit, **delete**, **export Excel/PDF** |
| `staff` | Her assistant | View, add, edit. **Cannot delete. Cannot export.** |

- Login with **email + password** (Supabase Auth). Public sign-up is off; Constance creates both users in the Supabase dashboard.
- A table `app_roles (email text primary key, role text check (role in ('admin','staff')))` decides who may use the app. An authenticated user whose email is not in `app_roles` sees "This account doesn't have access to the CRM. Ask Constance to add it." and is signed out.
- A `security definer` SQL function `my_role()` returns the caller's role from `app_roles` using `auth.jwt() ->> 'email'` (case-insensitive).
- **Row Level Security on every table:** select/insert/update allowed when `my_role() is not null`; **delete allowed only when `my_role() = 'admin'`**. `app_roles` is readable only for your own row and has no insert/update/delete policies (managed in the SQL editor only).
- In the UI, hide Delete buttons, "Remove Examples" and the Export buttons for staff. Show who is signed in plus a role chip in the header ("Full access" / "View, add, edit") and a Sign Out button.
- Note for the README: staff can still read whatever they can see (screenshots, copying); "no export" means no export buttons.

---

## 3. Data model (Supabase / Postgres)

Use proper columns. All tables have `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz default now()` (with an update trigger), and `created_by uuid references auth.users default auth.uid()`. Enable Realtime on all four data tables.

**contacts**
- `name text not null`, `phone text`, `race text check (race in ('Chinese','Malay','Indian','Others'))` nullable
- `roles text[]` (values: `owner`, `landlord`, `buyer`, `tenant`, `agent`), `note text`, `is_example boolean default false`

**listings**
- `deal text check (deal in ('sale','rent'))`
- `address text not null` (one full-address field; there is no separate name or taman field)
- `type text` (one of the property types in §5)
- `price numeric` (asking price, or monthly rent when deal = rent)
- `built_up_sqft numeric`, `land_sqft numeric`, `bedrooms int`, `bathrooms int`
- `furnishing text` (`Unfurnished` / `Partly furnished` / `Fully furnished`)
- `tenure text` (`Freehold` / `Leasehold` / `Malay reserve` / `Bumi lot`)
- `status text check (status in ('available','sold','rented','withdrawn'))` default `available` (there is **no** "Under offer")
- `owner_id uuid references contacts(id) on delete set null`
- `viewing_access text` (viewing / keys), `note text`, `is_example boolean default false`

**leads** (a buyer or tenant enquiry)
- `contact_id uuid references contacts(id) on delete set null`
- `deal text check (deal in ('sale','rent'))` (shown as Buy / Rent)
- `property_types text[]` (multiple; empty = any type)
- `areas text` (free text, comma separated; "Any" means any area)
- `budget_min numeric`, `budget_max numeric`
- `stage text` (see §5), `next_follow_up date`, `source text` (see §5)
- `timeline text` (move-in / timeline), `lost_reason text`
- `last_contacted_at timestamptz`, `is_example boolean default false`

**lead_notes**: `lead_id uuid references leads(id) on delete cascade`, `text text not null`, plus standard columns. (Notes are a log, newest first.)

**tenancies** (rent reminders)
- `tenant_name text not null`, `phone text`, `address text`
- `start_date date`, `end_date date`, `pay_day int check (pay_day between 1 and 31)`
- `rent numeric`, `account_holder text`, `bank text`, `account_number text`

**tenancy_payments**: `tenancy_id uuid references tenancies(id) on delete cascade`, `month date` (first day of the month), unique (`tenancy_id`, `month`).

Put the schema, RLS policies, `my_role()` and the realtime publication in `supabase/migrations/` and a seed file `supabase/seed_roles.sql` with placeholder emails.

**Existing data:** an earlier prototype stored records in tables `contacts`, `properties`, `leads`, `rentals`, each shaped `(id text, data jsonb)`. If those exist, rename them to `legacy_*` first and write a one-off SQL migration that copies their data into the new tables (field names in the jsonb: contacts `name, phone, race, roles, note`; properties `address, deal, type, price, size, land, beds, baths, furnish, tenure, status, ownerId, access, note`; leads `contactId, deal, ptypes, areas, budgetMin, budgetMax, stage, nextFollowUp, source, moveIn, lostReason, notes[{at,text}], lastContactAt`; rentals `tenant, phone, address, start, end, payDay, rent, accName, bank, accNo, paidMonths["YYYY-MM"]`). Map the old status `offer` to `available`.

---

## 4. Look and feel

Soft, airy "fintech dashboard" style with a warm pastel palette. Calm, friendly, never glaring.

**Layout**
- A gradient header band at the top (about 320 px tall, rounded bottom corners 40 px). White, very rounded cards overlap into it.
- A decorative "3D glass fan" in the header's right side: 7 translucent white pill shapes (46×240 px, radius 9999) fanned from a common bottom point at −60°, −40°, −20°, 0°, 20°, 40°, 60°, with a white-to-lavender glass gradient, a thin white border and an inner glow. Purely decorative (`aria-hidden`), partly cropped off the edge, smaller on phones.
- Lots of white space inside cards; one hero element per screen.

**Colour tokens**
```
--page:        #F8F6F4   warm off-white page background
--card:        #FFFFFF
--ink:         #25223A   main text
--text-2:      #6F7680   secondary text
--text-3:      #9AA1AA   faint text
--line:        #ECE8F0   card borders
--hero:        linear-gradient(115deg, #FFD8C4 0%, #F9CADB 32%, #D9CDF6 64%, #C3E6F2 100%)
--brand:       #6F63C6   lavender: primary buttons, selected chips, focus ring
--brand-ink:   #3B3270   text on soft lavender, hover of primary
--brand-soft:  #EFEAFB   selected nav item / soft highlight
pastels (icon wells, avatars):
  peach #FFE3D3 (text #8A4320) · mint #DAF2E5 (#2C6A4C) · lilac #ECE5FB (#3B3270)
  butter #FFF2C7 (#7A5A06) · baby blue #DCEEF9 (#24577A) · rose #FBE1EA (#8A2F52)
status:  good #8FD4AE · overdue / lost #F5A08C · due soon / in between #F6D36B
```
Every contact avatar circle gets one of the six pastels, picked by a stable hash of the record id, so each person always has the same colour. Status colours appear only as small dots or thin bars, never as filled cards.

**Type:** Urbanist from Google Fonts (weights 300–600). Big numbers in weight 300; headings 500–600; tabular numbers wherever digits line up.

**Shapes:** cards radius 28 px (hero cards 40 px, nested cards 18 px). Every button, chip and filter is a pill. Thin line icons (1.5 px stroke). Almost no shadows.

**Barcode charts:** instead of normal bars, a row of thin vertical lines (about 40 per card). Filled lines in a status colour, the rest pale grey, so each chart doubles as a progress bar.

**Logo:** Constance's illustrated portrait in a gold ring, `public/logo.png` (I will supply the file; use a placeholder circle until it exists). 44 px in the header next to "Constance Chan" / "Property CRM · PEA3963", 72 px on the login card, and as the favicon. Never crop it to a square or put it on the lavender colour.

**Navigation**
- Desktop: header with logo on the left, a pill-shaped nav (Today, Leads, Listings, Contacts, Rent) and an "Add" primary button on the right.
- Phone: the same five sections in a floating white pill bar at the bottom, with a round lavender "+" button in the middle.
- Each section has its own URL (`/today`, `/leads`, `/listings`, `/contacts`, `/rent`). Record details open in a bottom sheet on phones and a centred dialog on desktop.

---

## 5. Fixed lists (use exactly these, in this order)

**Property types**
Condo / Apartment · Low Cost Flat · Low Cost House · 1 / 1.5 Storey Terrace House · 2 / 2.5 Storey Terrace House · Cluster House · Semi D House · Bungalow House · Townhouse · Shop · Shop Office · Terraced Factory · Cluster Factory · Semi D Factory · Land

**Lead stages** (pipeline order): New · Contacted · Viewing Set · Viewed · Negotiating · Booked · Closed · Lost
Open stages = New through Booked.

**Lead sources ("Came From")**: Mudah · Google / AI · PropertyGuru · iProperty · EdgeProp · Facebook · NextSix · Referral · Banner · XiaoHongShu · Other

**Listing status:** Available · Sold · Rented · Withdrawn

**Race:** Chinese · Malay · Indian · Others

**Contact roles:** Owner · Landlord · Buyer · Tenant · Co-Agent

**Banks (alphabetical, but any text is allowed):** Affin Bank · Alliance Bank · AmBank · Bank Islam · Bank Muamalat · BSN · CIMB · Hong Leong Bank · HSBC · Maybank · OCBC · Public Bank · RHB · Standard Chartered Bank · UOB

---

## 6. Screens

### Login
Centred white card on the gradient: logo, "Constance CRM", "Sign in to see your leads and listings.", Email, Password, "Sign In". Clear error text: "Wrong email or password. Try again."

### Today (home)
- Header text: small label "Today's overview", headline "Good morning / Good afternoon / Good evening, Constance", and the full date with year.
- **Five summary cards**, all built the same way (pastel icon well + title → small grey sub-label → big number + small status dot and text → barcode chart → footer text + round ↗ button that opens the related page):
  1. Follow-ups Due: due today or overdue (barcode: contacted today green, due today yellow, overdue coral)
  2. Open Leads: with "N new this week"; footer says how many have no follow-up date
  3. Available Listings: with "N matched" (listings that fit at least one open lead)
  4. Viewing To Booking: leads in Viewing Set → Booked
  5. Closed: all time, with lost count
- **Follow-ups panel** (right column on desktop, below on phone): overdue first, then today, then "Next 7 days". Below that, a "Rent Due" list for tenancies overdue or due within 3 days.
- **Pipeline:** one small card per stage with its count and a mini barcode; tapping a stage opens Leads filtered to it.
- If example records exist, show a banner with "Remove Examples" (admin only).

### Leads
- Header actions: Export Excel, Export PDF (admin only), Paste From WhatsApp, **New Lead**.
- Search (name, phone, area, type, notes) and stage filter pills: Open (default), each stage, All.
- Rows sorted by next follow-up: avatar initials, name, "Buy/Rent · types · areas · budget", stage chip, follow-up text ("Today", "Tomorrow", "3d overdue" with a coral dot, or the date).
- **Lead detail:** WhatsApp button (opens `wa.me` with "Hi <first name>, "), phone with a copy button, **Match In Listing Hub** (§9), Edit, Contact Card. Stage picker chips (choosing Lost asks for a reason; Closed or Lost clears the follow-up date). Next follow-up date with +1 Day, +3 Days, +1 Week, Clear. Budget, types, areas, timeline. Note box with "Counts as contacted today" (ticked by default; saving a note while the stage is New moves it to Contacted). Note history, newest first. "Matching Listings" from this CRM's own listings. Delete Lead (admin only, with an in-page confirmation, no browser dialogs).
- **New Lead form:** Client (pick an existing contact or "+ New Contact" with Name, WhatsApp Number, Race); Looking To: Buy / Rent; **Property Type as tick-box pills (multiple allowed; none ticked means any type)**; Preferred Areas (plain text, no dropdown); Budget From / Up To (RM); Stage; **Next Follow-up (defaults to 2 days from today)**; Came From; Timeline / Move-in; Why Lost (only when stage is Lost); First Note.

### Listings
- Header actions: Export Excel, Export PDF (admin only), Paste From WhatsApp, **New Listing**.
- Search, filter pills: All / For Sale / For Rent, and Available (default) / Sold / Rented / Withdrawn / All.
- **Rows in the same horizontal style as Leads** (not cards): house icon well; line 1 the full address; line 2 small grey "type · Built-up 1,650 sqft · Land 1,540 sqft · 4 bed / 3 bath · furnishing"; right side the price (`RM 680k` or `RM 1,800 /mo`), a Sale/Rent chip, a status dot, and "N match" if open leads fit. On phones the address may wrap to two lines and the Sale/Rent chip hides.
- **Listing detail:** price large, RM psf for sales, status chips, all fields, owner card with WhatsApp ("Hi <name>, about your unit at <address>: "), "Buyers And Tenants Who Fit" (open leads that match; only for Available listings), Delete Listing (admin).
- **New Listing form:** For Sale / For Rent; **Full Address** (multi-line, saved as one line); Type; Asking Price or Rent Per Month (label switches); Built-up (sqft); **Land Size (sqft)**; Bedrooms; Bathrooms; Furnishing; Tenure; Status; Owner / Landlord (pick or "+ New Contact" with name, WhatsApp, Race); Viewing / Keys; Notes.

### Contacts
- Header actions: Export Excel, Export PDF (admin only), New Contact.
- Search; role filter pills (All, Owner, Landlord, Buyer, Tenant, Co-Agent); **race filter pills (All Races, Chinese, Malay, Indian, Others, Not Set)**. Constance uses the race filter plus Export to send festival greetings, so the export must respect the current filters.
- Rows: avatar, name, phone, "N listings · N leads", race and role chips.
- Detail: WhatsApp, copy phone, Edit, notes, listings they own, their enquiries, "Add Enquiry", "Add Their Listing", Delete Contact (admin; warns that linked listings/leads stay but lose the link).

### Rent (Rent Reminders)
- Header: "Rent Reminders", "Monthly rental reminders for your tenants", **New Tenancy**.
- Search; filter pills: Active (default), Due Soon (N), Ending Within 60 Days, Ended, All.
- Rows: avatar, tenant name, address, rent `/mo`, and status: "Due in 2d", "Due today" (yellow), "4d overdue" (coral), "Paid for November" (green dot), "Tenancy ended". Add "Ends 19 March 2027" when the end date is within 60 days.
- Status logic: the due date each month is `pay_day` (clamped to the month's last day). Paid if a `tenancy_payments` row exists for the current month. Ended if today is after `end_date`. Upcoming if before `start_date`.
- **Detail:** **Copy Message** (copies the reminder in §8), **Send On WhatsApp** (opens `wa.me` with the message filled in), **Mark Paid For <Month>** / "Undo Paid For <Month>", Edit, a preview of the exact message, the details grid, a yellow "Time to talk renewal" note when ending within 60 days, recent paid months as chips, Delete Tenancy (admin).
- **New Tenancy form:** Tenant Name, WhatsApp Number, Address, Tenancy Starts, Tenancy Ends, Rent Payment Date (day of month), Rental (RM per month), then Owner Bank Account: Account Holder Name, Bank (suggest from the list; free text allowed), Account Number.

---

## 7. Matching (inside the CRM)

A lead matches a listing when all of these hold:
- the listing is `available`;
- lead Buy ↔ listing For Sale, lead Rent ↔ listing For Rent;
- the lead has no property types, or the listing's type is one of them;
- the lead's areas are empty / "Any", or at least one area (case-insensitive) appears in the listing's address;
- price ≤ budget_max × 1.05 (if a max is set) and price ≥ budget_min × 0.8 (if a min is set).

Show counts on listings and Today, "Matching Listings" in lead detail, and "Buyers And Tenants Who Fit" in listing detail.

---

## 8. Rent reminder message (exact text)

```
Hi
{address}
Tenancy Period: {start dd/mm/yyyy} - {end dd/mm/yyyy}

⏰Reminder for Rental Payment ⏰
Owner Account Holder Name: {account holder}
Bank: {bank} {account number}
Rental: RM{rent with thousands separator, e.g. RM1,800}

Please send us the receipt for record after you made transfer. Thank you 😊
```
Example with real values:
```
Hi
A-18-05, Residensi Example, Jalan Tebrau, 80250 Johor Bahru
Tenancy Period: 20/03/2026 - 19/03/2027

⏰Reminder for Rental Payment ⏰
Owner Account Holder Name: Lim Ah Kow
Bank: Public Bank 12345678910
Rental: RM1,800

Please send us the receipt for record after you made transfer. Thank you 😊
```

---

## 9. Paste From WhatsApp, and Listing Hub hand-off

WhatsApp does not allow other apps to read personal chats, so these work by copy and paste. All parsing runs in the browser; no AI calls. Always show "What the CRM picked up" as a live preview, then **fill the normal form** for Constance to check before saving (never save straight from the parser). Keep the original pasted text as the first note (leads) or in Notes (listings). If the phone number already belongs to a contact, link to that contact instead of creating a duplicate, and say so in the preview.

Strip WhatsApp export prefixes like `[10/31/26, 11:32:31 PM] You: ` or `31/10/2026, 9:10 pm - Ah Seng: `, and leading emoji such as 📍🏠.

**Lead parser**: extract:
- phone (Malaysian mobile, with or without `+60`, spaces or dashes);
- name (first short line without digits or request words; "Mr Chan", "陈先生" are names);
- race (`Chinese|Malay|Indian`, also 华人/马来人/印度人);
- Buy/Rent (`WTB, buy, invest, 买` → Buy; `WTR, rent, tenant, 租` → Rent);
- property types (terrace/排屋 → both terrace types unless "single/1/1.5" or "double/2/2.5 storey" or 单层/双层 is given; a line that is only "Single Storey" or "Double Storey" also means terrace; condo/apartment/公寓; low cost flat/组屋; low cost house; cluster; semi-d/半独立; bungalow; townhouse; shop office/shop lot/店屋 → Shop Office; "shop" alone → Shop; land/土地; factory variants);
- budget (`below/under/max/within/以下/以内 X` → max; `above/min/at least/以上 X` → min; `A - B`, `A to B`, `A至B` → range; `budget X` → max; units `k`, `mil`, `m`, `万`; ignore the phone number when reading money);
- areas (text after `area`, `location`, `WTB`/`WTR` or `@`, minus property words, plus any known JB area names found).

Test cases (the parser must produce these):
```
Mr Chan / 012-1234567 / WTB terrace house / budget below 600k
→ Mr Chan, 012-1234567, Buy, both terrace types, max 600,000, area empty

012-7631462 / Felicia Chen / WTR Taman Universiti / Single Storey / Budget below 1500 / Chinese
→ Felicia Chen, Rent, 1 / 1.5 Storey Terrace House, Taman Universiti, max 1,500, Chinese

012-7119657 / Max Lim / Chinese / WTR Desa Cemerlang / Shop / Budget 2500-3000 / Facing main road
→ Max Lim, Rent, Shop, Desa Cemerlang, 2,500–3,000, Chinese

Ms Lee / 016 888 1234 / WTR condo Tebrau or Setia Indah / budget 1.5k-2k
→ Rent, Condo / Apartment, areas Tebrau + Setia Indah, 1,500–2,000

陈先生 / 0127778888 / 想买双层排屋 预算60万以下 Skudai
→ Buy, 2 / 2.5 Storey Terrace House, Skudai, max 600,000
```
(" / " above means a new line.)

**Listing parser**: extract sale/rent (`for sale, selling, 出售, 售价` vs `for rent, rental, per month, /month, 出租, 租金`), one type, address (lines with Jalan/Jln/Taman/Tmn/Lorong/Persiaran/Residensi/postcode; skip price, size, room and contact lines), price (`RM680k`, `RM1.2mil`, `RM1,800/month`, `售价 RM1.2mil`), built-up sqft, land (sqft, or `22x70` = 1,540 sqft), rooms (`4 bed 3 bath`, `3R2B`), furnishing, tenure (`freehold`, `FH`, `leasehold`, `LH`), owner name and phone (`Owner: Mr Lim 012-…`, `Contact owner Ms Tan …`, `屋主 陈先生 …`).

Test cases:
```
For Sale / Jalan Austin Perdana 2/8, Taman Mount Austin / Double storey terrace / Built-up 1650sqft, Land 22x70 / 4 bed 3 bath / Freehold, partly furnished / Selling RM680k / Owner: Mr Lim 012-3456789
→ sale, 2 / 2.5 Storey Terrace House, that address, 680,000, 1,650 / 1,540 sqft, 4/3, Partly furnished, Freehold, Mr Lim 012-3456789

[31/10/2026, 9:10 pm] Ah Seng EAG: 🏠For Rent🏠 / 📍Residensi Tebrau, Jalan Tebrau / Condo high floor 1100sf 3R2B / Fully furnished / Rental RM1,800/month / Contact owner Ms Tan 016-888 9999
→ rent, Condo / Apartment, "Residensi Tebrau, Jalan Tebrau", 1,800, 1,100 sqft, 3/2, Fully furnished, Ms Tan 016-888 9999
```

**Match In Listing Hub** (button in lead detail): Constance also runs a separate team app, Listing Hub, at `https://claude.ai/artifact/VNvznHo5C7ZCFQFvdMKbxL`. The button copies this block to the clipboard and opens `<hub url>#crm` in a new tab, where she pastes it into the Hub's "Paste From CRM" box:
```
[CRM → Listing Hub]
Client: Max Lim
Phone: 012-7119657
Looking: Rent
Types: Shop
Areas: Desa Cemerlang
Budget Min: 2500
Budget Max: 3000
Notes: Facing main road
```
(Types are separated by `; `. Newlines in notes become ` · `. If clipboard access fails, show the block in a sheet so she can select and copy it.) Keep this exact format; the Hub already parses it.

---

## 10. Export (admin only)

- Export Excel (`.xlsx`, via SheetJS) and Export PDF (A4 landscape, via jsPDF + autotable) on Leads, Listings and Contacts. Export **exactly the rows currently shown** (current search and filters).
- File name: `Constance Chan <Leads|Listings|Contacts> <YYYY-MM-DD>.<ext>`.
- Excel has all columns; PDF has the main columns and a light header band in the brand colours with "Constance Chan · PEA3963 · <date> · N records" and page numbers.
- Columns: Leads → Name, Phone, Race, Looking To, Property Types, Areas, Budget From, Budget Up To, Stage, Next Follow-Up, Came From, Timeline, Latest Note, Added On. Listings → Full Address, Sale / Rent, Type, Price, Built-up, Land, Bed, Bath, Furnishing, Tenure, Status, Owner, Owner Phone, Viewing / Keys, Notes. Contacts → Name, Phone, Race, Role, Listings Owned, Enquiries, Notes.
- Embed a font that covers Chinese characters in the PDF (e.g. Noto Sans SC subset), because some client names are in Chinese.

---

## 11. Behaviour details

- Changes made by one user appear for the other without refreshing (Supabase Realtime).
- Use optimistic updates for quick actions (stage, follow-up date, mark paid) with an error toast if the save fails: "Couldn't save. Check your connection and try again."
- Toasts are short past-tense confirmations: "Lead added", "Follow-up set for 9 November 2026", "Marked paid for November 2026", "Message copied. Paste it in WhatsApp."
- No `alert()` / `confirm()`; all confirmations are inline.
- Empty states say what goes there and offer the add button ("No tenancies yet. Add a tenancy to send monthly rent reminders in one tap.").
- Accessibility: visible focus ring in `--brand`, labels on every input, 44 px minimum touch targets, respects `prefers-reduced-motion`.
- Optional example data: a seed script that inserts a few records marked `is_example = true`, removable with "Remove Examples" (admin). Never mix examples into exports unless they're shown.

---

## 12. Build order

1. Scaffold Vite + React + TS + Tailwind; set up design tokens, Urbanist, layout shell, header gradient and glass fan, bottom nav.
2. Supabase migrations: tables, RLS, `my_role()`, realtime; `seed_roles.sql`; legacy migration (§3).
3. Auth: login page, session handling, role loading, sign out, access-denied state.
4. Contacts → Listings → Leads (with notes) → Rent, each with list, filters, detail sheet, forms.
5. Today dashboard and matching.
6. WhatsApp parsers with unit tests (Vitest) covering every test case in §9.
7. Exports.
8. Listing Hub hand-off.
9. README: setup steps in plain language (create Supabase project, run migrations, turn off sign-ups, create the two users, edit `seed_roles.sql` and run it, set env vars, deploy to Netlify/Vercel).

---

## 13. Acceptance tests (all must pass)

- [ ] Staff user: cannot see Delete or Export anywhere, and a direct `delete` through the Supabase client is refused by RLS (write an automated test against a local Supabase or document a manual check).
- [ ] A signed-in user not in `app_roles` sees nothing and is told to ask Constance.
- [ ] Every parser test case in §9 passes.
- [ ] The rent reminder copied for the example tenancy matches §8 character for character.
- [ ] New Lead defaults the follow-up date to today + 2 days.
- [ ] Contacts filtered to "Chinese" then exported contains only those contacts.
- [ ] Every visible date includes the year; no Chinese words in the UI.
- [ ] At 400 px wide: no horizontal scroll, bottom nav works, sheets scroll, address rows wrap cleanly.
- [ ] Two browsers signed in as the two users see each other's edits within a few seconds.
- [ ] Match In Listing Hub copies the exact block format and opens the Hub link with `#crm`.

When you finish, give me a short summary of what's built, anything you couldn't do, and the exact steps I need to do myself (Supabase, users, deployment).
