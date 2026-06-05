// Copy this file to js/config.js and fill in your keys (js/config.js is git-ignored).
// In CI these values are injected from GitHub Actions secrets instead.

// Mapy.com tile key — RESTRICT it by domain in the Mapy dashboard (used client-side).
export const MAPY_API_KEY = "YOUR_MAPY_API_KEY";

// Supabase project URL and the PUBLISHABLE key (sb_publishable_...). It is safe to ship:
// Row-Level Security keeps it read-only. NEVER put the SECRET key (sb_secret_...) here.
export const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YOUR_KEY";
