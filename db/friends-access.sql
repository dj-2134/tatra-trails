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

create policy "authed read closures" on closures for select to authenticated
  using (exists (select 1 from hikes h where h.id = closures.hike_id));
