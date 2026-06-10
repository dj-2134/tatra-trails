-- db/add-regions.sql — run in Supabase Studio → SQL Editor (after db/schema.sql is live).
-- Increment C: Slovakia-wide regions (geomorphological celky) + M:N hike memberships.
-- Idempotent: safe to run more than once.

create table if not exists regions (
  id bigint generated always as identity primary key,
  slug text unique not null,
  name_en text not null,
  name_sk text not null,
  kraj text,                                   -- informational; nullable (ranges can span kraje)
  centroid_lon double precision,               -- representative longitude; drives east→west order
  centroid_lat double precision,               -- representative latitude; reserved for future map use
  is_public boolean not null default false,    -- curate-in: hidden publicly until explicitly published
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hike_regions (
  hike_id   bigint not null references hikes(id)   on delete cascade,
  region_id bigint not null references regions(id) on delete cascade,
  primary key (hike_id, region_id)
);

create index if not exists hike_regions_region_id_idx on hike_regions (region_id);

-- RLS: public may READ; only the authenticated admin may write (mirrors hikes/closures).
-- NOTE: read is intentionally unrestricted in Increment C — public/private is enforced
-- client-side (display-level). Hard RLS withholding of private rows is Increment D.
alter table regions      enable row level security;
alter table hike_regions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='regions' and policyname='public read regions') then
    create policy "public read regions" on regions for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='regions' and policyname='admin write regions') then
    create policy "admin write regions" on regions for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='hike_regions' and policyname='public read hike_regions') then
    create policy "public read hike_regions" on hike_regions for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='hike_regions' and policyname='admin write hike_regions') then
    create policy "admin write hike_regions" on hike_regions for all to authenticated using (true) with check (true);
  end if;
end $$;
