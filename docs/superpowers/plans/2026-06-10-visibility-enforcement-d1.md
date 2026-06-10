# Visibility Enforcement (D1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TatraTrails' public/private boundary real — the anonymous (publishable-key) role can read only public content; authenticated users read all — and silence the favicon 404.

**Architecture:** Replace the four blanket `public read … using (true)` SELECT policies with role-scoped policies (`to anon using (<public condition>)` + `to authenticated using (true)`) on `regions`, `hike_regions`, `hikes`, `closures`. Conditions reference strictly downward (`closures → hikes → hike_regions → regions`) so there's no policy recursion. No JS changes; the public board just receives less data. Add an inline-SVG favicon to both pages.

**Tech Stack:** Supabase Postgres + RLS (PostgREST), static HTML. Verification is manual (RLS is DB-level, not `node --test`-able).

**Spec:** `docs/superpowers/specs/2026-06-10-visibility-enforcement-d1-design.md` (commit `b2e2ed4`). **Branch:** `master` (small, low-risk; matches recent doc-on-master flow).

> ⚠️ **Never `git add db/admin-rls.sql`** — its local working copy holds the real founder UUID (uncommitted, on purpose). Every commit below uses explicit file paths.

---

## File Structure

**Create:** `db/enforce-visibility-rls.sql` — the migration the founder runs in Supabase.
**Modify:** `db/schema.sql` (mirror the new read policies), `index.html` + `admin.html` (favicon).
**Unchanged:** all `js/**`, `db/admin-rls.sql`.

---

## Task 1: RLS read-enforcement migration (+ schema mirror)

**Files:**
- Create: `db/enforce-visibility-rls.sql`
- Modify: `db/schema.sql`

- [ ] **Step 1: Write `db/enforce-visibility-rls.sql`** with exactly:

```sql
-- db/enforce-visibility-rls.sql — Increment D1: enforce visibility at the database.
-- The anon (publishable-key) role may read ONLY public content; authenticated users read all.
-- Run in Supabase Studio -> SQL Editor (after the regions + hike-visibility migrations). Idempotent.
-- No founder UUID here — these are role-based SELECT policies. Founder-scoped WRITE policies
-- (db/admin-rls.sql) are intentionally untouched.

-- 1. Drop the old blanket public-read policies (they let the anon role read everything).
drop policy if exists "public read hikes"        on hikes;
drop policy if exists "public read closures"     on closures;
drop policy if exists "public read regions"      on regions;
drop policy if exists "public read hike_regions" on hike_regions;

-- 2. Authenticated users (founder now; invited friends in D2) read everything.
drop policy if exists "authed read hikes"        on hikes;
drop policy if exists "authed read closures"     on closures;
drop policy if exists "authed read regions"      on regions;
drop policy if exists "authed read hike_regions" on hike_regions;
create policy "authed read hikes"        on hikes        for select to authenticated using (true);
create policy "authed read closures"     on closures     for select to authenticated using (true);
create policy "authed read regions"      on regions      for select to authenticated using (true);
create policy "authed read hike_regions" on hike_regions for select to authenticated using (true);

-- 3. Anonymous (publishable key) reads ONLY public content. Conditions reference strictly downward
--    (closures -> hikes -> hike_regions -> regions) so there is no policy recursion; each lower
--    policy filters the subquery the policy above relies on. Table columns are qualified to avoid
--    ambiguity with the subquery's table.
drop policy if exists "anon read regions"      on regions;
drop policy if exists "anon read hike_regions" on hike_regions;
drop policy if exists "anon read hikes"        on hikes;
drop policy if exists "anon read closures"     on closures;

create policy "anon read regions" on regions for select to anon
  using (regions.is_public);

create policy "anon read hike_regions" on hike_regions for select to anon
  using (exists (select 1 from regions r where r.id = hike_regions.region_id and r.is_public));

create policy "anon read hikes" on hikes for select to anon
  using (hikes.is_public and exists (select 1 from hike_regions hr where hr.hike_id = hikes.id));

create policy "anon read closures" on closures for select to anon
  using (exists (select 1 from hikes h where h.id = closures.hike_id));
```

- [ ] **Step 2: Mirror the new read policies into `db/schema.sql`**

Read `db/schema.sql` first. Make these changes:

(a) **Remove** the four blanket public-read lines (they currently read, verbatim):
```sql
create policy "public read hikes"    on hikes    for select using (true);
create policy "public read closures" on closures for select using (true);
```
(in the hikes/closures policy block) and
```sql
create policy "public read regions"      on regions      for select using (true);
create policy "public read hike_regions" on hike_regions for select using (true);
```
(in the Increment-C block). Leave every `admin write …` policy untouched.

(b) **Append at the very END of `db/schema.sql`** (so all four tables already exist — the `anon read hikes`/`closures` policies reference `hike_regions`/`regions`, which a fresh top-to-bottom run defines earlier; putting these last guarantees the references resolve):
```sql
-- Increment D1: role-scoped read policies (anon = public only; authenticated = all).
create policy "authed read hikes"        on hikes        for select to authenticated using (true);
create policy "authed read closures"     on closures     for select to authenticated using (true);
create policy "authed read regions"      on regions      for select to authenticated using (true);
create policy "authed read hike_regions" on hike_regions for select to authenticated using (true);

create policy "anon read regions" on regions for select to anon
  using (regions.is_public);
create policy "anon read hike_regions" on hike_regions for select to anon
  using (exists (select 1 from regions r where r.id = hike_regions.region_id and r.is_public));
create policy "anon read hikes" on hikes for select to anon
  using (hikes.is_public and exists (select 1 from hike_regions hr where hr.hike_id = hikes.id));
create policy "anon read closures" on closures for select to anon
  using (exists (select 1 from hikes h where h.id = closures.hike_id));
```

- [ ] **Step 3: Commit** (explicit paths — NOT `git add -A`, NOT `db/admin-rls.sql`):

```bash
git add db/enforce-visibility-rls.sql db/schema.sql
git commit -m "feat(db): enforce visibility via role-scoped RLS read policies (D1)"
```

- [ ] **Step 4: Manual verification (founder — applies to the LIVE DB)**

The founder runs `db/enforce-visibility-rls.sql` in Supabase Studio → SQL Editor, then verifies. **Note: the SQL Editor runs as a privileged role and BYPASSES RLS — it cannot show the anon effect. Verify via the anon REST API or a logged-out browser.**

1. **Decisive test — anon API returns only public rows.** With at least one private region/hike present, run (filling in the project URL + the **publishable** key):
   ```bash
   curl -s "https://<PROJECT>.supabase.co/rest/v1/regions?select=slug,is_public" -H "apikey: <PUBLISHABLE_KEY>"
   curl -s "https://<PROJECT>.supabase.co/rest/v1/hikes?select=slug,is_public"   -H "apikey: <PUBLISHABLE_KEY>"
   ```
   Expected: **only `is_public=true` rows** (private ones absent) — proving the boundary, not just UI hiding.
2. **Public board unchanged:** logged-out, the board still shows public regions → bands → hikes; search works; no console errors.
3. **Admin unchanged:** in `/admin.html`, the founder still sees and edits **all** hikes/regions (incl. private).
4. If anything looks wrong (e.g. the public board goes empty, or a "infinite recursion detected in policy" error from the API), STOP and report — do not patch blindly; re-check the policy conditions against the spec.

---

## Task 2: Favicon (silence the 404)

**Files:**
- Modify: `index.html`, `admin.html`

- [ ] **Step 1: Add the favicon `<link>` to `index.html`**

Read `index.html`'s `<head>`. Immediately after the `<title>…</title>` line, add this exact line:

```html
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%2315633f' d='M1 28 L11 8 L17 19 L21 13 L31 28 Z'/%3E%3C/svg%3E">
```

(Inline SVG mountain in the brand green `#15633f` → `%2315633f`; `%3C`/`%3E` are `<`/`>`. No external file, no extra request.)

- [ ] **Step 2: Add the same `<link>` to `admin.html`**

Read `admin.html`'s `<head>`. Immediately after the `<title>…</title>` line, add the identical line:

```html
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%2315633f' d='M1 28 L11 8 L17 19 L21 13 L31 28 Z'/%3E%3C/svg%3E">
```

- [ ] **Step 3: Guard the suite**

Run: `node --test`
Expected: still **99 pass, 0 fail** (no JS changed; this just confirms nothing was disturbed).

- [ ] **Step 4: Commit** (explicit paths):

```bash
git add index.html admin.html
git commit -m "fix(ui): inline-SVG favicon on board + admin (silence /favicon.ico 404)"
```

- [ ] **Step 5: Manual verification (founder)**

Serve locally / open the deployed pages: a small green mountain shows on the browser tab, and the console no longer logs a `/favicon.ico` 404 on either page.

---

## Notes for the implementer

- **No automated tests:** RLS is database-level (not reachable by `node --test`); the favicon is cosmetic. Verification is the founder's manual steps. Do not invent a DB/RLS test harness.
- **Policy ordering in `schema.sql`:** the role-scoped read policies go at the END of the file because the `anon read hikes`/`closures` policies reference other tables — those must already exist on a fresh run.
- **No founder UUID** anywhere in these files (the anon/authed read policies are role-based). The founder-scoped *write* policies stay in `db/admin-rls.sql`, which you must **never stage**.
- **D2 prerequisite (not this increment):** `regions`/`hike_regions` *write* policies are still `to authenticated using(true)` (any authenticated user can write them). Must be founder-scoped in D2 before friends can sign in. Out of D1 scope; documented in the spec §7.
- **This changes the live DB on apply** — Task 1 Step 4's anon-API check is the real proof of enforcement.
```
