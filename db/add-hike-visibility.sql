-- db/add-hike-visibility.sql — run in Supabase Studio → SQL Editor.
-- Per-hike public/private. Default true so existing hikes stay visible (still gated by region).
-- Display-level only in this increment (no RLS change); hard enforcement is a later increment.
-- Idempotent.
alter table hikes add column if not exists is_public boolean not null default true;
