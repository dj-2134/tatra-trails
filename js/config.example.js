// Copy this file to js/config.js and fill in your keys (js/config.js is git-ignored).
// In CI these values are injected from GitHub Actions secrets instead.

// Mapy.com tile key — RESTRICT it by domain in the Mapy dashboard (used client-side).
export const MAPY_API_KEY = "YOUR_MAPY_API_KEY";

// Supabase project URL and the PUBLIC anon key. The anon key is safe to ship:
// Row-Level Security makes it read-only. NEVER put the service_role key here.
export const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
