# Constance CRM

A private CRM for Constance Chan (REN PEA3963): leads (buyers and tenants), listings with their owners, contacts, and monthly rent reminders. Built with Vite + React + TypeScript + Tailwind, a PostgreSQL database, and small API functions, all hosted on Vercel.

- **Admin (Constance):** view, add, edit, delete, export Excel/PDF.
- **Staff (assistant):** view, add, edit. Cannot delete, cannot export.

Permissions are enforced **inside Postgres** with Row Level Security, not only in the screens. Every API request runs as a limited database role with the signed-in email attached. A staff `delete` touches 0 rows even if someone calls the API directly. Note: staff can still read whatever they can see (screenshots, copying); "no export" means there are no export buttons for them.

---

## Put it online (Vercel + Postgres)

You only do this once.

### 1. Import the project into Vercel
1. Go to **vercel.com/new** while signed in.
2. Under **Import Git Repository**, pick **constancechancc-web/PropertyCRM**. If you can't see it, click **Adjust GitHub App Permissions** and give Vercel access to that repository.
3. Leave the settings as they are (Framework: Vite) and click **Deploy**. The first deploy works even before the database exists.

### 2. Add the database
1. In the Vercel project, open **Storage → Create Database → Neon (Postgres)**, choose the **Singapore** region (closest to Johor Bahru), and connect it to the project for all environments. Vercel adds `DATABASE_URL` for you.
2. Open **Settings → Environment Variables** and add `SESSION_SECRET`: a random value of at least 32 characters. To make one, run:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Go to **Deployments**, open the menu on the latest one and click **Redeploy**. Each deploy creates or updates the tables and security rules automatically.

### 3. Create the two logins
There is no public sign-up. On your computer, in this folder:
1. Copy `.env.example` to `.env`. Paste the `DATABASE_URL` value from Vercel (**Storage → your database → .env.local tab**) into it.
2. Run these (on Windows PowerShell use `npm.cmd` instead of `npm`). You'll be asked to type the password twice; it stays hidden and isn't saved in your command history:
   ```bash
   npm run user:add -- constance@yourmail.com admin
   ```
   ```bash
   npm run user:add -- assistant@yourmail.com staff
   ```
   **To change a password**, run the same command again. Every device signed in with the old password is signed out. To take away someone's access:
   ```bash
   npm run user:remove -- assistant@yourmail.com
   ```
3. Optional: add example records to try things out (remove them later with **Remove Examples** on Today):
   ```bash
   npm run db:seed-examples
   ```

### 4. Old prototype data (only if you have it)
The database setup renames old tables shaped `(id text, data jsonb)` (`contacts`, `properties`, `leads`, `rentals`) to `legacy_*`. If your old data is in another database, copy those four tables into the new one first. Then run:
```bash
npm run db:import-legacy
```
It runs only once and maps the old "offer" status to Available.

### 5. Logo
The logo (`public/logo.png`) and the favicons are the same portrait as constancechan.my. To change them, replace those files in `public/`.

---

## Work on it locally

```bash
npm install
```
```bash
npm run dev
```
Open http://localhost:5173. Without a `DATABASE_URL`, the app uses a local Postgres (PGlite) stored in `.data/pglite`, created with three test users: `constance@example.com` (admin), `assistant@example.com` (staff) and `outsider@example.com` (no access). Their password is `DEV_USER_PASSWORD` from `.env` (default in `.env.example`). Delete `.data/` to start fresh.

Tests (parsers, rent message, matching, exports, and real Postgres permission checks):
```bash
npm test
```

## How things work
- **Live updates:** each open browser checks the database change log every 3 seconds. The other person's edits show up within a few seconds without refreshing.
- **Paste From WhatsApp:** parsing runs in the browser, with no AI. It always fills the normal form for you to check before saving.
- **Match In Listing Hub:** copies the `[CRM → Listing Hub]` block and opens the Hub at `#crm`.
- **Exports:** Excel and PDF export exactly the rows on screen (current search and filters). The PDF embeds a Chinese-capable font, loaded only when you export.

## Folders
- `src/`: the app (pages, components, parsers in `src/lib/parsers.ts`)
- `server/`: API, login, database access
- `api/`: the Vercel function that serves `/api/*` (via the rewrite in vercel.json)
- `db/`: `schema.sql` (tables, RLS, roles), `seed_examples.sql`, `import_legacy.sql`
- `scripts/db.ts`: migrate, users, seeds
- `tests/`: automated checks for the acceptance tests
