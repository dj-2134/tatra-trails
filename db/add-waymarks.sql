-- Increment F: per-segment waymarks + closure extents. Additive and safe to run before
-- the matching frontend deploys. Run in the Supabase SQL Editor.
alter table hikes    add column if not exists waymark_segments    jsonb;
alter table hikes    add column if not exists seasonal_extent_from jsonb;
alter table hikes    add column if not exists seasonal_extent_to   jsonb;
alter table closures add column if not exists extent_from jsonb;
alter table closures add column if not exists extent_to   jsonb;
-- No RLS changes: existing hikes/closures policies cover the new columns.
