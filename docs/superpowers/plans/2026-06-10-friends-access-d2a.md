# Friends Access — Phase D2a (Access Model) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the database access model for friends — an `allowed_viewers(email, role)` allowlist, a locked-down `is_owner()` helper, RLS so authenticated users see *public OR everything-if-allowlisted* and only the owner writes — plus the pure `showAll` rendering logic the D2b client will use.

**Architecture:** One new migration (`db/friends-access.sql`) creates the allowlist + `is_owner()` SECURITY DEFINER helper, seeds the owner, and overhauls the **read** policies; `db/admin-rls.sql` is rewritten to role-based owner-only **writes** (no UUID). `db/schema.sql` mirrors both. `js/regions.js` gains a `showAll` flag (pure, unit-tested). No client/UI yet — that's D2b.

**Tech Stack:** Supabase Postgres + RLS, `node:test`. RLS verification is manual (founder, on the live DB); `js/regions.js` is unit-tested.

**Spec:** `docs/superpowers/specs/2026-06-10-friends-access-d2-design.md` (commit `a83906c`). **Branch:** `master`.

> ⚠️ **`db/admin-rls.sql` reversal:** D2a deliberately **rewrites** `admin-rls.sql` to role-based policies with **NO UUID**, so the committed file becomes clean and **IS committed** in Task 3 (unlike before). Verify it contains no UUID before committing. Still never use `git add -A`; stage explicit paths.

---

## File Structure
- **Create:** `db/friends-access.sql` (allowlist + `is_owner()` + read overhaul + owner seed).
- **Rewrite:** `db/admin-rls.sql` (owner-only writes, role-based, no UUID).
- **Modify:** `db/schema.sql` (mirror), `js/regions.js` + `tests/regions.test.js` (`showAll`).

---

## Task 1: `js/regions.js` `showAll` flag (TDD)

**Files:** Modify `js/regions.js`; Test `tests/regions.test.js`.

- [ ] **Step 1: Append failing tests to `tests/regions.test.js`**

The file has fixture `R` (`R.vt` public id 1, `R.vv` private id 3) and `const h = (slug, distance_m, region_ids) => ({ slug, distance_m, region_ids });`. Append:

```js
test("publicVisibleHikes: showAll returns every hike regardless of region/is_public", () => {
  const hikes = [
    { ...h("pub", 1000, [1]) },
    { ...h("privregion", 1000, [3]) },                 // only a private region
    { ...h("hidden", 1000, [1]), is_public: false },   // private hike
    { ...h("noregion", 1000, []) },                    // no region at all
  ];
  const got = publicVisibleHikes(hikes, [R.vt, R.vv], true).map((x) => x.slug).sort();
  assert.deepEqual(got, ["hidden", "noregion", "privregion", "pub"]);
});

test("groupHikesByRegion: showAll includes private regions that have hikes", () => {
  const hikes = [{ ...h("vvh", 1000, [3]) }]; // in VV (private)
  assert.deepEqual(groupHikesByRegion(hikes, [R.vv], false), []);          // off: private region omitted
  const model = groupHikesByRegion(hikes, [R.vv], true);                   // on: shown
  assert.deepEqual(model.map((g) => g.region.slug), ["volovske-vrchy"]);
  assert.deepEqual(model[0].bands.flatMap((b) => b.hikes.map((x) => x.slug)), ["vvh"]);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/regions.test.js`
Expected: FAIL (the two new tests; `publicVisibleHikes`/`groupHikesByRegion` ignore the 3rd arg today).

- [ ] **Step 3: Add the `showAll` flag in `js/regions.js`**

Replace `publicVisibleHikes` and the region-loop guard in `groupHikesByRegion`:

```js
// Hikes belonging to >=1 public region AND not individually hidden. region_ids: number[];
// is_public defaults to public when absent. showAll=true returns ALL hikes (authenticated full view).
export function publicVisibleHikes(hikes, regions, showAll = false) {
  if (showAll) return [...(hikes || [])];
  const pub = publicRegionIdSet(regions);
  return (hikes || []).filter(
    (h) => h.is_public !== false && (h.region_ids || []).some((id) => pub.has(id))
  );
}

// Render model: [{ region, bands:[{ band, hikes }] }]. showAll=false → public, non-empty regions only
// (today's behavior). showAll=true → EVERY non-empty region (private included) + all hikes.
export function groupHikesByRegion(hikes, regions, showAll = false) {
  const visible = publicVisibleHikes(hikes, regions, showAll);
  const out = [];
  for (const region of sortRegionsEastWest(regions)) {
    if (!showAll && !region.is_public) continue;
    const inRegion = visible.filter((h) => (h.region_ids || []).includes(region.id));
    if (!inRegion.length) continue;
    const bands = [];
    for (const band of BANDS) {
      const inBand = inRegion.filter((h) => bandForDistance(h.distance_m) === band.key);
      if (inBand.length) bands.push({ band, hikes: inBand });
    }
    out.push({ region, bands });
  }
  return out;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test` — all pass (the 2 new + every existing test, since `showAll` defaults `false`). Report the count.

- [ ] **Step 5: Commit**

```bash
git add js/regions.js tests/regions.test.js
git commit -m "feat(regions): showAll flag for the authenticated full view (D2a)"
```

---

## Task 2: `db/friends-access.sql` — allowlist, `is_owner()`, read overhaul, owner seed

**Files:** Create `db/friends-access.sql`; Modify `db/schema.sql`.

- [ ] **Step 1: Write `db/friends-access.sql`** exactly:

```sql
-- db/friends-access.sql — Increment D2a: friend/owner access model.
-- Run in Supabase Studio -> SQL Editor AFTER db/enforce-visibility-rls.sql, and BEFORE re-running
-- db/admin-rls.sql (which swaps WRITES to owner-only). Idempotent.
-- Internal order matters: create table + is_owner(), SEED THE OWNER, then swap READ policies.

-- 1. The allowlist: who may see everything. role 'owner' may also write (db/admin-rls.sql).
create table if not exists allowed_viewers (
  email    text primary key,
  role     text not null default 'friend' check (role in ('owner','friend')),
  added_at timestamptz not null default now()
);
alter table allowed_viewers enable row level security;

-- 2. is_owner(): the ONLY SECURITY DEFINER function. Reads allowed_viewers bypassing RLS so it can be
--    used in policies ON allowed_viewers without self-recursion. Locked down.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.allowed_viewers
    where email = (auth.jwt() ->> 'email') and role = 'owner'
  );
$$;
revoke execute on function public.is_owner() from anon, public;
grant execute on function public.is_owner() to authenticated;

-- 3. allowed_viewers policies.
drop policy if exists "self read allowed_viewers"   on allowed_viewers;
drop policy if exists "owner manage allowed_viewers" on allowed_viewers;
create policy "self read allowed_viewers" on allowed_viewers for select to authenticated
  using (email = (auth.jwt() ->> 'email'));
create policy "owner manage allowed_viewers" on allowed_viewers for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- 4. SEED THE OWNER. Replace the placeholder with YOUR login email, then run. MUST precede the
--    db/admin-rls.sql write swap, or you lose write access.
insert into allowed_viewers (email, role) values ('REPLACE_WITH_YOUR_EMAIL@example.com', 'owner')
  on conflict (email) do update set role = 'owner';

-- 5. READ overhaul: authenticated sees public OR everything-if-allowlisted. Anon policies from
--    db/enforce-visibility-rls.sql are unchanged. Replaces D1's "authed read X using (true)".
drop policy if exists "authed read regions"      on regions;
drop policy if exists "authed read hike_regions" on hike_regions;
drop policy if exists "authed read hikes"        on hikes;
drop policy if exists "authed read closures"     on closures;

create policy "authed read regions" on regions for select to authenticated
  using (regions.is_public
         or exists (select 1 from allowed_viewers av where av.email = (auth.jwt() ->> 'email')));

create policy "authed read hike_regions" on hike_regions for select to authenticated
  using (exists (select 1 from regions r where r.id = hike_regions.region_id and r.is_public)
         or exists (select 1 from allowed_viewers av where av.email = (auth.jwt() ->> 'email')));

create policy "authed read hikes" on hikes for select to authenticated
  using ((hikes.is_public and exists (select 1 from hike_regions hr where hr.hike_id = hikes.id))
         or exists (select 1 from allowed_viewers av where av.email = (auth.jwt() ->> 'email')));

-- closures inherit: visible iff the parent hike is visible to this role (the authed-read-hikes policy
-- already accounts for allowlisting), so no extra allowlist clause is needed here.
drop policy if exists "authed read closures" on closures;
create policy "authed read closures" on closures for select to authenticated
  using (exists (select 1 from hikes h where h.id = closures.hike_id));
```

- [ ] **Step 2: Mirror into `db/schema.sql`**

Read `db/schema.sql`. The D1 read policies live at the end (`authed read …`, `anon read …`). Make these changes so a fresh top-to-bottom run is valid (the allowlist table + `is_owner()` must exist before the policies that reference them):

(a) **Remove** the four `create policy "authed read X" … to authenticated using (true);` lines (added in D1).
(b) **Append at the very END** of `db/schema.sql`:
```sql

-- Increment D2a: friend/owner allowlist + helper.
create table if not exists allowed_viewers (
  email    text primary key,
  role     text not null default 'friend' check (role in ('owner','friend')),
  added_at timestamptz not null default now()
);
alter table allowed_viewers enable row level security;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.allowed_viewers
                 where email = (auth.jwt() ->> 'email') and role = 'owner');
$$;
revoke execute on function public.is_owner() from anon, public;
grant execute on function public.is_owner() to authenticated;

create policy "self read allowed_viewers" on allowed_viewers for select to authenticated
  using (email = (auth.jwt() ->> 'email'));
create policy "owner manage allowed_viewers" on allowed_viewers for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Authenticated reads: public OR everything-if-allowlisted.
create policy "authed read regions" on regions for select to authenticated
  using (regions.is_public
         or exists (select 1 from allowed_viewers av where av.email = (auth.jwt() ->> 'email')));
create policy "authed read hike_regions" on hike_regions for select to authenticated
  using (exists (select 1 from regions r where r.id = hike_regions.region_id and r.is_public)
         or exists (select 1 from allowed_viewers av where av.email = (auth.jwt() ->> 'email')));
create policy "authed read hikes" on hikes for select to authenticated
  using ((hikes.is_public and exists (select 1 from hike_regions hr where hr.hike_id = hikes.id))
         or exists (select 1 from allowed_viewers av where av.email = (auth.jwt() ->> 'email')));
create policy "authed read closures" on closures for select to authenticated
  using (exists (select 1 from hikes h where h.id = closures.hike_id));
```
(The `anon read …` policies stay as-is. The `admin write …` policies are handled in Task 3.)

- [ ] **Step 3: Commit** (explicit paths):

```bash
git add db/friends-access.sql db/schema.sql
git commit -m "feat(db): allowed_viewers + is_owner() + authenticated read overhaul (D2a)"
```

---

## Task 3: Rewrite `db/admin-rls.sql` — owner-only writes (role-based, no UUID)

**Files:** Rewrite `db/admin-rls.sql`; Modify `db/schema.sql`.

- [ ] **Step 1: Replace the ENTIRE contents of `db/admin-rls.sql`** with (use Write to overwrite — this removes the old UUID-based policies AND any real UUID from your local working copy):

```sql
-- db/admin-rls.sql — Increment D2a: WRITES restricted to the owner (role='owner' in allowed_viewers),
-- via is_owner() (db/friends-access.sql). NO founder UUID — identity is seeded data.
-- Run in Supabase Studio -> SQL Editor AFTER db/friends-access.sql (which creates is_owner() and seeds
-- the owner row). Safe to re-run.
drop policy if exists "admin write hikes"        on hikes;
drop policy if exists "admin write closures"     on closures;
drop policy if exists "admin write regions"      on regions;
drop policy if exists "admin write hike_regions" on hike_regions;

create policy "admin write hikes"        on hikes        for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "admin write closures"     on closures     for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "admin write regions"      on regions      for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "admin write hike_regions" on hike_regions for all to authenticated using (public.is_owner()) with check (public.is_owner());
```

- [ ] **Step 2: Mirror into `db/schema.sql`**

In `db/schema.sql`, replace each of the four `create policy "admin write X" … for all to authenticated using (true) with check (true);` lines with the `is_owner()` form:
```sql
create policy "admin write hikes"        on hikes        for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "admin write closures"     on closures     for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "admin write regions"      on regions      for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "admin write hike_regions" on hike_regions for all to authenticated using (public.is_owner()) with check (public.is_owner());
```
These reference `public.is_owner()`, which Task 2 appended near the end of `schema.sql`. **Move the four `admin write` policy lines to the END of `schema.sql`, after the `is_owner()` definition** (so a fresh run defines the function before the policies use it). If they currently sit mid-file (right after each table), delete them there and place them at the very end (after the Task-2 block).

- [ ] **Step 3: Safety check — NO UUID in the committed file**

Run: `grep -nE "[0-9a-f]{8}-[0-9a-f]{4}-" db/admin-rls.sql` → expect **no matches** (no UUID). Also confirm `db/admin-rls.sql` no longer shows as locally-modified-with-secret: it's now the role-based version on disk.

- [ ] **Step 4: Commit** (explicit paths — `db/admin-rls.sql` is now clean/UUID-free and SHOULD be committed):

```bash
git add db/admin-rls.sql db/schema.sql
git commit -m "feat(db): owner-only writes via is_owner() (role-based, drop founder UUID) (D2a)"
```

---

## Task 4: Apply + verify on the live DB (founder — manual)

No code; this is the gate that proves D2a. Do it in order.

- [ ] **Step 1: Seed your owner email**

Edit your **local** copy of `db/friends-access.sql` (do NOT commit this edit), replacing
`REPLACE_WITH_YOUR_EMAIL@example.com` with the email you log in with (your magic-link admin email; and, if different, also add a row for the Google email you'll use). The committed file keeps the placeholder.

- [ ] **Step 2: Run the migrations IN ORDER** in Supabase SQL Editor

1. `db/friends-access.sql` (creates table + `is_owner()`, seeds your owner row, swaps reads).
2. `db/admin-rls.sql` (swaps writes to owner-only).
Expected: no "infinite recursion detected in policy" error.

- [ ] **Step 3: Verify the access matrix**

- **Anon still public-only** (regression of D1): `curl.exe "<URL>/rest/v1/regions?select=slug,is_public" -H "apikey: <PUBLISHABLE_KEY>"` → only public rows. (PowerShell: `Invoke-RestMethod <url> -Headers @{ apikey = '<key>' }`.)
- **Owner can still write:** in `/admin.html` (signed in as the founder), create/edit a hike AND edit a region — both succeed (this confirms the write swap + the seeded owner row work; if a write fails with a policy/permission error, your owner email seed didn't match your JWT email — fix the seed).
- **`is_owner()` is locked:** `grant`/`revoke` applied (anon can't execute) — optional check in SQL editor: `select has_function_privilege('anon','public.is_owner()','execute');` → `false`.

- [ ] **Step 4: Report** the verification results. If owner writes fail, STOP — the owner seed email must equal `auth.jwt()->>'email'` for your session; do not loosen the policies.

---

## Notes for the implementer
- **Only `js/regions.js` (Task 1) is unit-tested.** Tasks 2–4 are SQL/manual — do not invent a DB test harness or run SQL yourself (no credentials); the founder applies + verifies.
- **`db/admin-rls.sql` is now committed clean** (role-based, no UUID) — this is the intended removal of the founder UUID from the repo. Verify no UUID before committing (Task 3 Step 3).
- **The owner seed** uses a placeholder email in the committed file; the founder fills theirs locally and does not commit it.
- **Apply order is load-bearing:** `friends-access.sql` (seeds owner) before `admin-rls.sql` (needs owner to exist), or the founder loses write access.
- **D2b (next plan):** the board "Sign in with Google" + lazy `supabase-js` + authenticated re-fetch (`fetchHikes`/`fetchRegions` gain an optional Bearer token) + `showAll` wiring + the owner-only "Viewers" friend-management UI + README OAuth setup. Planned after D2a is applied and verified live.
```
