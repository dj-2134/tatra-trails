# TatraTrails — Friends Access (Increment D2) — Design Spec

**Date:** 2026-06-10
**Status:** Design approved in brainstorming; ready for implementation planning.
**Roadmap:** Increment **D** (visibility) — **D2 (this spec)**, building on **D1** (hard RLS read-enforcement, live).

> **Goal.** Let invited friends sign in (Google) and see the **full** board (private regions/hikes included),
> enforced at the database; keep the anonymous board dependency-free; manage the guest list in-app; and close
> the `regions`/`hike_regions` write gap. Content stays **two-tier**: anon → public; allowlisted authed → all.

---

## 1. Scope

**In scope (implemented in two phases):**
- **D2a — access model (backend):** `allowed_viewers(email, role)` table; one locked-down `is_owner()`
  SECURITY DEFINER helper; RLS overhaul (reads: anon=public / authed=public-or-allowlisted; writes:
  owner-only across all four content tables); rewrite `db/admin-rls.sql` to role-based (removes the founder
  UUID); Google OAuth provider config (manual); the pure show-all logic in `js/regions.js` (+ tests).
- **D2b — client (board + admin):** "Sign in with Google" on the board (lazy-loaded), authenticated re-fetch
  + show-all rendering + sign-out/indicator; the owner-only **friend-management UI** in admin.

**Out of scope (later / YAGNI):**
- Per-hike "friends-only vs owner-only" sub-tiers (still two content tiers).
- Freemium/payments (separate future initiative; this is its substrate).
- Magic-link for friends (replaced by Google OAuth — email delivery can't reach friends on the no-domain
  Resend path; the founder's own magic-link admin login still works).

---

## 2. Identity model — `allowed_viewers(email, role)`

A single source of truth:

```
allowed_viewers(
  email      text primary key,
  role       text not null default 'friend' check (role in ('owner','friend')),
  added_at   timestamptz not null default now()
)
```

- **Owner** = a row with `role='owner'` (you). **Friend** = `role='friend'` (invited viewers). Both see
  everything; only **owner** writes.
- **Seeding:** you insert your own `('<your-email>','owner')` row **once via SQL** (the committed migration
  uses a **placeholder email** you replace locally — your address never enters the public repo). Friends are
  added afterward through the in-app UI (§7).
- **`is_owner()`** — the only new SECURITY DEFINER function. `STABLE`, `search_path` pinned, `EXECUTE` revoked
  from `anon` (granted to `authenticated`); returns
  `exists (select 1 from allowed_viewers where email = auth.jwt()->>'email' and role='owner')`, reading the
  table while **bypassing RLS** so it can be used in policies *on* `allowed_viewers` without self-recursion.
  This is a single deliberate, locked-down function — distinct from (and not to be confused with) the leftover
  Supabase-template `rls_auto_enable()` the founder still intends to revoke/drop.

**`allowed_viewers` RLS:**
- `self read` — `for select to authenticated using (email = auth.jwt()->>'email')` (a plain comparison, no
  subquery → no recursion). Lets any authed user read **their own** row, which is what the content tables'
  inline allowlist check relies on.
- `owner manage` — `for all to authenticated using (is_owner()) with check (is_owner())`. Lets the owner read
  the **full** list and add/remove rows (powers the management UI) without recursion (the SD helper bypasses
  RLS).

---

## 3. RLS overhaul on the content tables

Replaces D1's `authed read … using (true)` policies and the founder-UUID write policies. The **anon** read
policies from D1 are unchanged.

- **Reads — `to anon`:** unchanged from D1 (public only; the downward-layered conditions).
- **Reads — `to authenticated`:** `using (<D1 public condition> OR <allowlisted>)`, where
  `<allowlisted>` = `exists (select 1 from allowed_viewers av where av.email = auth.jwt()->>'email')`
  (inline; **no** SECURITY DEFINER — resolves via the `self read` policy). Effect: an allowlisted owner/friend
  sees everything; a signed-in **non**-invited Google user sees only public.
- **Writes — all four tables (`hikes`, `closures`, `regions`, `hike_regions`):**
  `for all to authenticated using (is_owner()) with check (is_owner())`. This closes the
  `regions`/`hike_regions` write gap **and** supersedes the founder-UUID write policies — so
  `db/admin-rls.sql` is **rewritten to the role-based form with no UUID** (identity is now seeded data).

**Non-recursion:** `allowed_viewers.self read` has no subquery; `is_owner()` bypasses RLS; content policies
reference `allowed_viewers` (+ the D1 downward chain), none of which point back to the content tables. No
policy recurses.

**⚠️ Apply order (critical):** the migration must (1) create `allowed_viewers` + `is_owner()`, (2) **seed the
owner row**, then (3) swap the write policies to `is_owner()`. If writes are swapped before the owner row
exists, the founder loses write access. The migration enforces this order and the founder re-verifies writing
immediately after applying.

---

## 4. Google OAuth (manual Supabase setup)

A one-time founder configuration, documented in the README alongside the existing auth setup:
- Create a Google Cloud OAuth client (web), set the authorized redirect URI to the Supabase callback.
- In Supabase → Authentication → Providers → Google: enable, paste client id/secret.
- Add the site origin(s) to Supabase Auth redirect URLs (localhost + the Pages domain).

The founder's existing **magic-link admin login is unchanged** (their email → `owner`). Friends use Google;
no email delivery is involved, so the Resend no-domain limitation is irrelevant.

---

## 5. Board sign-in (same board, lazy-loaded) — D2b

- A small **"Sign in with Google"** control in the board topbar.
- **`supabase-js` loads lazily** — only when the control is clicked, or when the page loads and detects an
  OAuth return (tokens in the URL hash). A normal anonymous visitor never triggers it → the public board stays
  **dependency-free** exactly as today.
- **Signed in:** the board obtains the session and re-fetches hikes/regions **authenticated** (RLS returns
  everything for an allowlisted user), then renders **show-all** (§6). A **"Sign out"** control + a subtle
  "signed in as …" indicator appear. Sign-out returns to the anonymous public view.
- **Signed-in but not allowlisted:** RLS returns only public, so the board shows the public content (same as
  anon); a gentle inline note ("Signed in, but not on the guest list") + sign-out. (Detect via the user's own
  `allowed_viewers` self-read returning no row.)
- **Data path:** authenticated fetches go through `supabase-js` (already loaded) or a `fetch` carrying the
  session `access_token` as the `Authorization: Bearer` header (+ `apikey`); either way RLS keys off the
  `authenticated` role. The anonymous path (raw `fetch` + anon key) is unchanged.

---

## 6. Show-all rendering (`js/regions.js`, pure + unit-tested) — D2a logic

`publicVisibleHikes` / `groupHikesByRegion` gain a `showAll` flag (default `false` = today's behavior):
- `showAll = true` → include **every** region that has ≥1 hike (private ones too) and **all** hikes (skip the
  `is_public`/public-region gates); ordering (east→west) and band grouping are unchanged.
- `js/trails.js` sets `showAll = (signedIn && allowlisted)`. Search likewise runs over the full set when
  `showAll`.
- Pure and unit-tested (no DOM). `js/trails.js` glue is manually verified, per convention.

---

## 7. Friend-management UI (admin, owner-only) — D2b

A **"Viewers"** section in `admin.html`:
- Lists `allowed_viewers` rows (email + role) — the owner reads the full list via the `owner manage` policy.
- **Add** (email input + role select `friend`/`owner`) and **Remove** (per row). Writes go through the
  `owner manage` policy (gated by `is_owner()`).
- New `js/admin/store.js` functions: `listViewers()`, `addViewer(email, role)`, `removeViewer(email)`.
- New `js/admin/ui.js` section + `admin.html` markup, styled like the existing admin lists.
- The **owner row is seeded via SQL** (§2); the UI manages **friends** (and additional owners if ever needed).

---

## 8. Error handling & edge cases

- **Owner not seeded before write-policy swap** → founder can't write; mitigated by the migration's apply
  order (§3) + immediate write re-verification.
- **Non-allowlisted Google sign-in** → public-only view (RLS), gentle note + sign-out; never private data.
- **OAuth redirect/login failure** → the board falls back to the anonymous public view; no crash.
- **`supabase-js` fails to load** (offline/CDN) on the friends path → the anonymous public board still renders;
  sign-in simply unavailable.
- **Removing a friend** → their next request returns public-only (RLS re-evaluates per request).
- **Self-removal / removing the last owner** → the UI should warn before removing an `owner` row (avoid
  locking out management); at minimum the founder can re-seed via SQL.

---

## 9. Code structure

**Create (D2a):** `db/friends-access.sql` — `allowed_viewers` + `is_owner()` + RLS overhaul + owner-seed
(placeholder email) in the correct apply order.
**Rewrite (D2a):** `db/admin-rls.sql` — role-based (`is_owner()`) write policies, **no UUID** (committable
clean). `db/schema.sql` — mirror the table, helper, and the new read/write policies.
**Modify (D2a):** `js/regions.js` (+ `tests/regions.test.js`) — `showAll`.
**Modify (D2b):** `index.html` (Sign-in control), `js/trails.js` (lazy auth + show-all wiring + sign-out),
`admin.html` + `js/admin/ui.js` + `js/admin/store.js` (Viewers UI), `README.md` (Google OAuth setup).
**Never staged:** the founder's local secrets; the committed `allowed_viewers` seed uses a placeholder email.

---

## 10. Testing

**Unit (`node:test`):** `js/regions.js` `showAll` — shows private regions + all hikes when on; identical to
today when off; search set follows `showAll`.

**Manual — the access matrix is the real proof (founder, post-apply):**
1. **anon API** → still public-only (D1 regression check).
2. **allowlisted Google sign-in** → board shows private regions/hikes; sign-out → back to public.
3. **non-allowlisted Google sign-in** → only public + the note.
4. **owner write** → can still create/edit a hike (after the policy swap) AND edit a region/membership
   (the closed gap).
5. **friend write attempt** → rejected by RLS (verify a direct authed write of a friend session fails).
6. **management UI** → owner adds a friend email (that friend then sees all on next load) and removes one
   (reverts to public); a non-owner cannot see/use the Viewers section (and RLS rejects writes regardless).

---

## 11. Deferred to implementation planning

1. Exact `is_owner()` definition + grant/revoke and `search_path` pinning.
2. Topbar placement/visuals of the Sign-in/Sign-out control and the "signed in" indicator.
3. The lazy-load mechanism for `supabase-js` on the board (dynamic `import()` vs injected script tag) and the
   OAuth-return detection.
4. Whether the authenticated board re-fetch uses `supabase-js` `.from()` or `fetch` + Bearer.
5. `db/friends-access.sql` internal ordering and idempotency details.
