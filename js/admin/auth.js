// js/admin/auth.js — thin wrapper around supabase-js auth (magic link / OTP).
// supabase-js owns the fiddly parts: sending the link, parsing the token from the
// return URL, persisting the session, and refreshing the JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";

// One shared client for the whole admin page (auth + data). The publishable key
// (sb_publishable_...) is used as the apikey; after sign-in supabase-js adds the
// session JWT as the Bearer token on every request automatically.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Send a magic link that returns to THIS page (works for localhost and production —
// both URLs must be in Supabase Auth's redirect allowlist; see db/admin-rls.sql setup).
export async function sendMagicLink(email) {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Fire cb(session|null) on sign-in/out so the UI can swap login <-> admin views.
export function onAuthChange(cb) {
  supabase.auth.onAuthStateChange((_event, session) => cb(session));
}
