# TatraTrails — Visibility Enforcement (Increment D1) — Design Spec

**Date:** 2026-06-10
**Status:** Design approved in brainstorming; ready for implementation planning.
**Roadmap:** Increment **D** (visibility), decomposed. **D1 = hard RLS read-enforcement + favicon (this spec).**
**D2 (separate, later)** = friend magic-link onboarding + the authenticated full-view board.

> **Why now.** Increments C and per-hike visibility made privacy **display-level**: the client filters by
> `is_public`, but the anonymous (publishable-key) API still returns *every* row. D1 makes the boundary
> **real** — the anon role can only *read* public content — without touching the public board's behavior.

---

## 1. Purpose

Turn display-level visibility into a database-enforced boundary: a request with the **anon** publishable key
can `SELECT` only public regions/hikes/hike_regions/closures. **Authenticated** users (the founder now;
invited friends in D2) read everything. Also: silence the `favicon.ico` 404.

---

## 2. Scope

**In scope:**
- Replace the four blanket `public read … using (true)` SELECT policies with **role-scoped** policies:
  `to anon using (<public condition>)` + `to authenticated using (true)`, on `regions`, `hike_regions`,
  `hikes`, `closures`.
- An inline-SVG favicon `<link rel="icon">` in `index.html` and `admin.html`.

**Out of scope (later / YAGNI):**
- **Friend authentication + the authenticated full-view board → D2.**
- **Founder-scoping the `regions`/`hike_regions` *write* policies → D2 prerequisite (see §7).**
- Any client/JS change (the public board behaves identically — see §5).
- Premium/freemium tiers (a separate future initiative).

---

## 3. RLS policy design (approach ①: inline subquery policies, role-scoped)

New migration `db/enforce-visibility-rls.sql` (idempotent; mirrored into `db/schema.sql`). **No founder UUID
appears** — these are role-based SELECT policies; the founder-scoped *write* policies in `db/admin-rls.sql`
are untouched.

For each read table: drop the old `public read … using (true)` policy; add `to authenticated using (true)`
(read-all) and `to anon using (…)`:

| table | `to anon using (…)` |
|---|---|
| `regions` | `is_public` |
| `hike_regions` | `exists (select 1 from regions r where r.id = region_id and r.is_public)` |
| `hikes` | `is_public and exists (select 1 from hike_regions hr where hr.hike_id = id)` |
| `closures` | `exists (select 1 from hikes h where h.id = hike_id)` |

**Non-recursion guarantee:** the conditions reference strictly *downward* — `closures → hikes →
hike_regions → regions → leaf`. No referenced table's anon policy points back up, so Postgres evaluates them
without "infinite recursion in policy" errors. Each lower policy does the filtering for the one above: the
`hikes` subquery over `hike_regions` only sees public-region rows (because `hike_regions`'s own anon policy
filters them), so `is_public AND exists(public-region membership)` exactly reproduces the app's
`publicVisibleHikes` rule (public hike in ≥1 public region). `closures`'s `exists(... hikes ...)` returns the
parent only if it's anon-visible, because the `hikes` anon policy filters that subquery.

**Result by role:**
- **anon (publishable key):** only public regions; only public-region membership rows; only hikes that are
  `is_public` AND in ≥1 public region; only closures of those hikes.
- **authenticated (founder; friends in D2):** everything (`using (true)`).
- **founder writes:** unchanged (founder-uid-scoped `for all` policies in `db/admin-rls.sql`).

---

## 4. Favicon

Add to `<head>` of `index.html` and `admin.html` a single self-contained line — an inline-SVG data-URI
`<link rel="icon" …>` drawing a small mountain in the brand accent green. No new file, no extra HTTP request,
eliminates the `/favicon.ico` 404. (Exact encoded SVG string is an implementation detail.)

---

## 5. What does NOT change

- **Public board** (`js/trails.js`, `js/regions.js`, `js/data.js`): **no code change.** The anon client now
  simply *receives* only public rows; the existing `publicVisibleHikes` client filter is retained as
  defense-in-depth (it now filters an already-public set — still correct, harmless). The board renders
  identically. A public hike that also belongs to a *private* region: anon receives the hike and only its
  public-region membership rows, so it appears solely under its public region(s) and never leaks the private
  association.
- **Admin** (`admin.html`, `js/admin/*`): the founder is `authenticated` → reads all via the new
  `to authenticated` select policies (which replace the read the old `public read` policy used to provide) →
  manages everything as before.
- **Keepalive workflow:** still gets a `200` from the anon API (public rows). Fine.

---

## 6. Error handling & edge cases

- **A region/hike toggled private** → immediately disappears from anon API responses (not just the UI).
- **All of a public region's hikes private** → anon receives the region row but no hikes for it; the board
  already omits empty regions. Fine.
- **No public content at all** → anon receives empty sets; the board renders an empty list (it already
  handles this). The founder still sees everything.
- **Migration is idempotent** (`drop policy if exists` before each `create policy`), safe to re-run.

---

## 7. Required D2 prerequisite (security finding, documented here so it isn't lost)

`db/admin-rls.sql` founder-scopes **writes** for `hikes` and `closures` only. `regions` and `hike_regions`
(added in Increment C, `db/add-regions.sql`) still have `admin write … for all to authenticated using (true)`
— **any authenticated user can write them.** Harmless while only the founder can authenticate, but **D2 must
founder-scope these two write policies before enabling friend sign-in**, or a logged-in friend could edit
regions/memberships. This is a D2 task (it needs the founder-UUID placeholder pattern that lives in
`admin-rls.sql`), explicitly out of D1's read-only scope.

---

## 8. Testing

RLS is database-level and not reachable by `node --test`. Verification is manual, by the founder, after
running the migration — and the **decisive** test is hitting the REST API *directly* with the anon key (proves
enforcement, not just UI hiding):

1. **Anon API enforcement (the real test):** with a private hike/region present, call the REST API with the
   **anon publishable key** (e.g. `GET /rest/v1/hikes?select=slug,is_public` and
   `GET /rest/v1/regions?select=slug,is_public` with the `apikey` header). The response must contain **only
   public rows** — the private ones absent. (A logged-out browser DevTools Network capture of the board's own
   requests works too.)
2. **Public board unchanged:** logged-out, the board still shows public regions → bands → hikes, search works,
   no console errors.
3. **Admin unchanged:** the founder still sees and edits *all* hikes/regions (incl. private) in `/admin.html`.
4. **Favicon:** no `/favicon.ico` 404 in the console on either page; a small icon shows on the tab.

---

## 9. Code structure

**Create:** `db/enforce-visibility-rls.sql` (the migration the founder runs).

**Modify:**
- `db/schema.sql` — replace the four `public read … using (true)` read policies with the eight role-scoped
  SELECT policies (plain `create policy` form, matching the file's style). Write policies untouched.
- `index.html`, `admin.html` — the favicon `<link rel="icon">`.

**No change:** `js/**` (the public board and admin behave identically), `db/admin-rls.sql` (founder writes
unchanged; never staged — it carries the founder's real UUID only in the local working copy).

---

## 10. Deferred to implementation planning

1. The exact inline-SVG data-URI for the favicon (brand-green mountain glyph).
2. Whether to also add a defensive `alter table … enable row level security;` in the migration (RLS is already
   enabled by prior migrations; likely omit to keep the migration policy-focused).
