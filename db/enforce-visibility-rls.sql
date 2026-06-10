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
