-- db/admin-rls.sql — Phase 2 lockdown: scope writes to the single founder account.
-- Run ONCE in Supabase Studio -> SQL Editor, AFTER db/schema.sql and AFTER creating
-- the founder user (Authentication -> Users). Safe to re-run.
--
-- SETUP:
--   1. Authentication -> Users: copy the founder's user id (UUID).
--   2. Replace BOTH 00000000-0000-0000-0000-000000000000 below with that UUID.
--   3. Run this whole script.

drop policy if exists "admin write hikes"    on hikes;
drop policy if exists "admin write closures" on closures;

create policy "admin write hikes" on hikes for all to authenticated
  using (auth.uid() = '00000000-0000-0000-0000-000000000000')
  with check (auth.uid() = '00000000-0000-0000-0000-000000000000');

create policy "admin write closures" on closures for all to authenticated
  using (auth.uid() = '00000000-0000-0000-0000-000000000000')
  with check (auth.uid() = '00000000-0000-0000-0000-000000000000');

-- The "public read hikes"/"public read closures" SELECT policies from db/schema.sql
-- are intentionally left unchanged.
