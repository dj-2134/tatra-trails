// js/auth-public.js — lazy Google sign-in for the PUBLIC board. supabase-js is imported ONLY when a
// sign-in is initiated or an OAuth return / stored session is detected, so anonymous visitors never
// load it (the board stays dependency-free for them). Mirrors js/admin/auth.js's client pattern.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

let clientPromise = null;
function client() {
  if (!clientPromise) {
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2")
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY));
  }
  return clientPromise;
}

// True when the URL carries OAuth tokens (a redirect back from Google) — load eagerly to finish login.
export function hasAuthRedirect() {
  return /[#&](access_token|error_description)=/.test(window.location.hash);
}

// True when supabase-js has a persisted session in localStorage (a returning, already-signed-in user) —
// lets us decide to lazy-load auth WITHOUT loading supabase-js for a fresh anonymous visitor.
export function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) return true;
    }
  } catch (e) { /* localStorage blocked */ }
  return false;
}

export async function signInWithGoogle() {
  const supabase = await client();
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if (error) throw error;
}

export async function getSession() {
  const supabase = await client(); // creating the client also parses an OAuth-return hash + stores the session
  const { data } = await supabase.auth.getSession();
  return data.session; // null, or { access_token, user: { email }, ... }
}

export async function signOut() {
  const supabase = await client();
  await supabase.auth.signOut();
}
