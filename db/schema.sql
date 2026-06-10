-- db/schema.sql — run in Supabase Studio → SQL Editor.
create table if not exists hikes (
  id bigint generated always as identity primary key,
  slug text unique not null,
  name_en text not null,
  name_sk text not null,
  geometry jsonb not null,                                  -- GeoJSON LineString/MultiLineString
  seasonal_from text check (seasonal_from ~ '^[0-9][0-9]-[0-9][0-9]$'),
  seasonal_to   text check (seasonal_to   ~ '^[0-9][0-9]-[0-9][0-9]$'),
  seasonal_partial boolean not null default false,
  note_en text,
  note_sk text,
  ref text,
  distance_m   integer check (distance_m   is null or distance_m   >= 0),
  ascent_m     integer check (ascent_m     is null or ascent_m     >= 0),
  duration_min integer check (duration_min is null or duration_min >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasonal_pair check ((seasonal_from is null) = (seasonal_to is null))
);

create table if not exists closures (
  id bigint generated always as identity primary key,
  hike_id bigint not null references hikes(id) on delete cascade,
  from_date date not null,
  to_date date,
  partial boolean not null default false,
  reason_en text not null,
  reason_sk text not null,
  source text,
  created_at timestamptz not null default now(),
  constraint date_order check (to_date is null or to_date >= from_date)
);

create index if not exists closures_hike_id_idx on closures (hike_id);

-- Row-Level Security: public may READ; only authenticated admin may write.
alter table hikes enable row level security;
alter table closures enable row level security;

create policy "public read hikes"    on hikes    for select using (true);
create policy "public read closures" on closures for select using (true);
create policy "admin write hikes"     on hikes    for all to authenticated using (true) with check (true);
create policy "admin write closures"  on closures for all to authenticated using (true) with check (true);

-- Increment C: Slovakia-wide regions (geomorphological celky) + M:N hike memberships.
create table regions (
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

create table hike_regions (
  hike_id   bigint not null references hikes(id)   on delete cascade,
  region_id bigint not null references regions(id) on delete cascade,
  primary key (hike_id, region_id)
);

create index hike_regions_region_id_idx on hike_regions (region_id);

-- RLS: public may READ; only the authenticated admin may write (mirrors hikes/closures).
-- NOTE: read is intentionally unrestricted in Increment C — public/private is enforced
-- client-side (display-level). Hard RLS withholding of private rows is Increment D.
alter table regions      enable row level security;
alter table hike_regions enable row level security;

create policy "public read regions"      on regions      for select using (true);
create policy "public read hike_regions" on hike_regions for select using (true);
create policy "admin write regions"      on regions      for all to authenticated using (true) with check (true);
create policy "admin write hike_regions" on hike_regions for all to authenticated using (true) with check (true);
