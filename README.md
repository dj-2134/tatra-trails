# TatraTrails

English-first trail-conditions board for the High Tatras. Increment 1 = the map foundation.

## Local setup
1. Copy the API-key template and add your key:
   ```powershell
   Copy-Item js/config.example.js js/config.js
   ```
   Get a free key at https://developer.mapy.com, then edit `js/config.js`.
   **Domain-restrict the key** in the Mapy dashboard (it ships in client-side JS).
   Also add your Supabase URL + **publishable** key to `js/config.js` (see **Backend (Supabase)** below) —
   the hikes board and the admin page both need them.
2. Run the unit tests:
   ```powershell
   node --test
   ```
3. Serve the site locally (any static server), e.g.:
   ```powershell
   python -m http.server 8000
   ```
   then open http://localhost:8000

## Backend (Supabase)
Hikes and closures live in a free Supabase project (Postgres + auto REST API).

1. Create a free project at https://supabase.com (EU region). Note the Project URL and the
   **publishable** key (`sb_publishable_...`).
2. In Supabase Studio → SQL Editor, run `db/schema.sql` then `db/seed.sql`.
3. Add your Supabase URL + publishable key to `js/config.js` (see `js/config.example.js`).
   The publishable key is read-only via Row-Level Security and safe to ship; the secret
   key (`sb_secret_...`) is never committed or sent to the browser.

### Deploy secrets
Add repository **Actions secrets** `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (alongside
`MAPY_API_KEY`). CI writes them into `js/config.js` at build time. A daily
`keepalive.yml` workflow pings the API so the free project does not pause.

## Deploy
Pushes to `master` deploy to GitHub Pages via `.github/workflows/pages.yml`.
Set a repository **Actions secret** `MAPY_API_KEY` (Settings → Secrets and variables → Actions),
and enable Pages (Settings → Pages → Source: GitHub Actions). The workflow writes `js/config.js`
from the secret at build time, so the real key is never committed.

## Admin (Phase 2)

A login-gated `admin.html` lets the founder manage hikes, closures and route geometry
without SQL. It deploys with the site (same Pages workflow) at `/admin.html`.

### One-time setup
1. **Disable public sign-ups** and **create the founder user**: Supabase → Authentication
   → turn *"Allow new users to sign up"* off; then Users → add the founder's email.
2. **Lock writes to that account:** copy the founder's user id (Authentication → Users),
   paste it into both placeholders in `db/admin-rls.sql`, and run the script in the SQL Editor.
3. **Allow the magic-link redirects:** Authentication → URL Configuration → Redirect URLs,
   add `http://localhost:8000/admin.html` and `https://<your-pages-domain>/admin.html`.

### Use
Open `/admin.html`, enter the founder email, click the magic link in your inbox, then
create/edit hikes. **Upload GPX** to set/fix a route (`hikes.geometry`); the editor shows a
live Open/Closed/Partial badge as you edit. The public board reads the same tables, so
changes appear there immediately.

> The admin loads `supabase-js` from an ESM CDN (admin page only); the public site stays
> dependency-free. Writes carry the session JWT and are RLS-scoped to the founder's uid.

## Regions (Increment C)

TatraTrails is organized by Slovak mountain range. Hikes are grouped **Region → distance band → hike** on the public board.

### Setup
In Supabase Studio → SQL Editor, run the scripts **in order**:
1. `db/add-regions.sql` — creates the `regions` table and the `hike_regions` M:N join table, and enables RLS.
2. `db/seed-regions.sql` — populates the full Slovak geomorphological taxonomy (*celky*: mountain ranges, highlands, basins, plains) and migrates all existing hikes into **Vysoké Tatry**.

### Organization
- Regions are ordered **east → west** automatically, derived from a stored `centroid_lon`.
- A region appears on the public board only when it is **marked public AND has ≥ 1 hike assigned**.
- Most regions are seeded with `is_public = false`; only Vysoké Tatry is published so existing content keeps showing immediately.

### Admin usage
- Every hike must have **≥ 1 region** assigned via the region multi-select in `admin.html`.
- **GPX upload pre-suggests** the nearest region(s) by centroid distance — confirm or adjust before saving.
- Use the **Public regions** toggles to publish a region once it has hikes assigned.
- Each hike also has its own **Public** toggle in the hike editor. A hike appears on the public board only when **both** its own flag is public **and** it belongs to ≥ 1 public region. New hikes default to public.

### Visibility caveat
Public/private is **display-level only** in this increment. The public list and search hide non-public regions and hikes, but all rows remain reachable via the anon API. Hard server-side RLS enforcement (withholding private rows at the database level) is a later increment.

## Friends access (Google sign-in, Increment D2)

Invited friends can sign in with Google on the public board and see all regions and hikes,
including those marked private. Everyone else (anonymous) sees only public content.
Access is enforced by Supabase RLS — the anonymous API never returns private rows.

### Enable Google OAuth (one-time)

1. In [Google Cloud Console](https://console.cloud.google.com), create an OAuth 2.0 **Web** client.
   Add the Supabase auth callback as an authorised redirect URI:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
2. In Supabase → Authentication → Providers → Google: enable Google, paste the client ID and secret.
3. In Supabase → Authentication → URL Configuration → Redirect URLs, add your site origins, e.g.:
   ```
   http://localhost:8000
   https://<your-pages-domain>
   ```

### Seed the owner and invite friends

1. **Seed the owner:** `db/friends-access.sql` inserts the founder's email with role `owner`
   (edit the placeholder email before running). Run it in Supabase Studio → SQL Editor
   **after** `db/enforce-visibility-rls.sql` and **before** re-running `db/admin-rls.sql`.
2. **Invite friends:** open `/admin.html` → **Viewers**, add a friend's Google email (role `friend`).
   They click **Sign in** on the board, authenticate with Google, and immediately see everything.
   A signed-in user whose email is *not* on the list sees only public content — same as anonymous.

### How it works

- **Anonymous visitors** — no sign-in, no dependency on `supabase-js`, the board stays
  fully dependency-free for them.
- **Signed-in visitors** — `supabase-js` loads only when the user clicks **Sign in**. After
  the OAuth redirect the board re-fetches with the session JWT, and RLS returns public + private rows
  for allowlisted users.
- **Writes** remain owner-only (enforced by `db/admin-rls.sql`); friends have read-only access.

## Attribution
Map tiles © Seznam.cz a.s. and others (Mapy.com). Later increments add trail data from
OpenStreetMap (© OpenStreetMap contributors, ODbL) and closure rules from TANAP (tanap.org).
Hike route geometry is traced from OpenStreetMap data (© OpenStreetMap contributors, ODbL).
Seasonal closure dates are from TANAP's Návštevný poriadok (tanap.org).
