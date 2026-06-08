-- db/add-hike-stats.sql — Increment A: per-hike stats. Run ONCE in Supabase Studio → SQL
-- Editor (safe to re-run). RLS is unchanged — existing policies already cover all columns.
alter table hikes
  add column if not exists distance_m   integer check (distance_m   is null or distance_m   >= 0),
  add column if not exists ascent_m     integer check (ascent_m     is null or ascent_m     >= 0),
  add column if not exists duration_min integer check (duration_min is null or duration_min >= 0);
