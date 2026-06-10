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
