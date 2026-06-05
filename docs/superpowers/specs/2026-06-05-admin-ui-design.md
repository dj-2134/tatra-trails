# TatraTrails — Admin UI (Phase 2) — Design Spec

**Date:** 2026-06-05
**Status:** Design approved in brainstorming; ready for implementation planning.
**Builds on:** Phase 1 (the open/closed overlay) — see `2026-06-05-trail-open-closed-overlay-design.md`.

---

## 1. Purpose

Give the solo founder a simple, login-gated **admin UI** to manage the data behind the
conditions board — **hikes**, their **ad-hoc closures**, and **route geometry (via GPX upload)** —
**without touching SQL**. Phase 1 already ships the schema, the `for all to authenticated` write
RLS, and the public read path; Phase 2 adds the authenticated front-end, the login, the lockdown
to a single admin, and GPX-based geometry editing.

---

## 2. Scope

**In scope:**
- A new `admin.html` page (same repo/deploy, public URL, login-gated).
- **Magic-link auth** (Supabase Auth) for a single admin (the founder).
- **Locking writes to that one account** (disable sign-ups + RLS scoped to the admin's user id).
- **Two-pane admin** (hike list + editor) to create/edit/delete hikes and their closures.
- **GPX upload → `hikes.geometry`** (the accuracy path for fixing routes, incl. the loop & Rysy).
- A **live status badge** in the editor (reuses Phase 1's `status.js`).

**Out of scope (YAGNI / later):**
- **Photos per hike** → **Phase 3** (its own increment: Supabase Storage + image resize + public
  gallery + cost/egress controls).
- Multi-admin / roles, audit log / edit history, undo, bulk import.
- The §11 auto-aggregation engine.
- Any public-site change (Phase 2 is admin-only; the public board is untouched).
- Localization of the admin UI itself — **admin is English-only**; the *data* stays EN + SK.

---

## 3. Architecture & auth flow

A new **`admin.html`** at the site root, deployed by the existing Pages workflow. It loads
**`supabase-js`** (from an ESM CDN) **only on the admin page**; the public site stays
dependency-free on plain `fetch`.

*Library choice (the one real fork):* the alternative is hand-rolling auth with raw `fetch`, but
magic-link means sending the link, handling the token-carrying redirect, persisting the session,
and **refreshing tokens** — fiddly and error-prone. `supabase-js` owns exactly that. Admin-only,
so the public bundle is unaffected.

**Auth flow:** open `/admin` → no session → enter email → `supabase-js` sends a magic link → click
it → return to `/admin` with a session → load hikes/closures and edit. Authenticated writes carry
`apikey: <publishable key>` **and** `Authorization: Bearer <session JWT>` — the correct combo for
an authenticated user (distinct from the read-only public path, which sends `apikey` only).

**Files (small, single-responsibility):**
```
admin.html                page shell (two-pane layout)
js/admin/auth.js          sign in / out, session (wraps supabase-js auth)
js/admin/store.js         hikes/closures CRUD via supabase-js
js/admin/gpx.js           PURE: GPX text -> GeoJSON LineString (unit-tested)
js/admin/ui.js            two-pane DOM: list + editor + closures
css/styles.css            reused; small admin-only additions as needed
```
The admin reads `SUPABASE_URL` + the publishable key from the existing `js/config.js` (already
injected by CI). The **secret key is never used or shipped.**

---

## 4. Security & RLS (locking writes to the founder)

1. **Disable public sign-ups** (Supabase → Authentication settings); create the single admin user
   (invite the founder). No other account can exist.
2. **Scope the write policies to the admin's user id.** A one-time `db/admin-rls.sql` replaces the
   Phase 1 `... to authenticated using(true)` policies on `hikes`/`closures` with:
   ```sql
   using (auth.uid() = '<ADMIN_USER_UUID>') with check (auth.uid() = '<ADMIN_USER_UUID>')
   ```
   `<ADMIN_USER_UUID>` is the founder's Supabase user id, obtained when the account is created
   (filled in at setup). Only that account can write — even if another somehow existed.
3. **Redirect allowlist:** add the deployed `/admin` URL to Supabase Auth's allowed redirect URLs
   so the magic link returns correctly.
4. Public **read** policies unchanged; the publishable key remains public-safe.

---

## 5. Admin UX — two-pane (chosen layout)

**Left pane:** hikes listed by name + a **“+ New hike”** button. Selecting a hike loads it into the
editor (selected row highlighted).

**Right pane — editor for the selected hike:**
- **Fields:** `slug` (editable on create, **read-only after** — it's the stable join key),
  `name_en`/`name_sk`, `seasonal_from`/`seasonal_to` (`MM-DD`) + **partial** checkbox,
  `note_en`/`note_sk`, `ref`.
- **Geometry:** **“Upload GPX”** (see §6) → shows “✓ N points” once parsed; written on Save.
- **Closures sub-section:** the hike's closures listed (date range or “ongoing”, partial, reason,
  source) each with edit/delete, plus **“+ Add closure”** → inline form (from/to date pickers,
  partial toggle, `reason_en`/`reason_sk`, `source`).
- **Live status badge:** reuses Phase 1's pure `status.js` to show the current Open/Closed/Partial
  as dates change — immediate feedback.
- **Actions:** **Save** (upsert hike + apply edits), **Delete hike** (confirm; closures cascade via
  the FK).

**Validation** mirrors the DB constraints client-side for friendly errors (`MM-DD` shape,
`to_date ≥ from_date`, required fields); the DB `CHECK`/`NOT NULL`/FK constraints remain the backstop.

---

## 6. GPX upload → geometry

`js/admin/gpx.js` exposes a **pure** `gpxToLineString(gpxText, { maxPoints = 500 } = {})`:
- Extracts track points (`<trkpt lat lon>`, falling back to `<rtept>`) by **string/regex parsing —
  no DOM** — so it is fully unit-testable in `node:test` (and works in the browser).
- Returns a GeoJSON `LineString` of `[lon, lat]` pairs.
- Applies **light, even decimation** to ≤ `maxPoints` so large tracks stay map-friendly.
- **Throws** if fewer than 2 points are found.

The UI reads the chosen `.gpx` file's text, calls `gpxToLineString`, shows “✓ N points” (or an
inline error), holds the result in the editor state, and writes it to `hikes.geometry` on Save.
This is how routes — including the lakeside loop and Popradské → Rysy — get fixed to 100%.

---

## 7. Data model

**No schema changes** beyond the RLS scoping in §4. Reuses the Phase 1 `hikes` and `closures`
tables and their constraints. (Photo storage arrives in Phase 3.)

---

## 8. Error handling

- **Not signed in / expired session** → show the email/login view; never attempt writes.
- **Write rejected by RLS** (e.g., wrong account) → surface a clear “not authorized” message.
- **GPX with no track points** → inline error; geometry unchanged.
- **Network/Supabase error** → non-destructive inline error; the editor keeps the unsaved values so
  nothing is lost.
- **Validation failures** → inline, before the request; DB constraints catch anything that slips through.

---

## 9. Testing

- **Unit-tested (pure, `node:test`):** `gpx.js` — sample GPX → correct LineString; `trkpt` and
  `rtept` paths; decimation to `maxPoints`; throw on empty/no-points. `status.js` is reused as-is
  (already tested) for the live badge.
- **Manual verification:** the `supabase-js`/DOM glue (`auth.js`, `store.js`, `ui.js`) — the thin
  binding layer, like `trails.js` in Phase 1. Verified by signing in and doing a full
  create → upload GPX → add closure → save → delete cycle, and confirming the public board reflects it.

---

## 10. Deploy & config

`admin.html` + `js/admin/*` ride the **existing Pages build** — no new workflow. They use the same
`SUPABASE_URL` + publishable key already written into `js/config.js` by CI. `supabase-js` loads from
an ESM CDN at runtime (no build step), consistent with the no-bundler setup.

---

## 11. Next increment (Phase 3 — photos)

Photos per hike get their own brainstorm/spec: Supabase **Storage** bucket (admin-write, public-read
policies), **image resize/compression on upload** and count limits to protect the free-tier egress,
an admin upload/reorder control, and a **public gallery** in the hike detail. Deliberately separate
because it adds object storage, cost/egress management, and public-side display — distinct from this
admin's text/geometry CRUD.

---

## 12. Deferred to implementation planning

1. Exact `supabase-js` version + ESM CDN (e.g. esm.sh / jsDelivr) and how it's imported in `admin.html`.
2. Precise two-pane DOM/CSS (reuse `styles.css` vars; minimal admin-specific classes).
3. The decimation algorithm detail in `gpx.js` (even-stride vs distance-based) — even-stride is fine.
4. Closure inline-form interaction specifics (add/edit in place vs a small modal).
5. The exact wording of the “not authorized” / session-expired states.
