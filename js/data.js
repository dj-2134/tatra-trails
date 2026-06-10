// js/data.js
// Thin read-only client for the Supabase PostgREST API. Config is passed in (not imported)
// so this module stays unit-testable without js/config.js present.
const SELECT =
  "slug,name_en,name_sk,geometry,seasonal_from,seasonal_to,seasonal_partial,note_en,note_sk,ref," +
  "distance_m,ascent_m,duration_min,is_public," +
  "closures(from_date,to_date,partial,reason_en,reason_sk,source)," +
  "hike_regions(region_id)";

const REGION_SELECT = "id,slug,name_en,name_sk,kraj,centroid_lon,centroid_lat,is_public";

// config: { url, key } ; fetchImpl defaults to the global fetch (browser).
export async function fetchHikes({ url, key }, fetchImpl = fetch, token = null) {
  const base = url.replace(/\/+$/, ""); // tolerate a trailing slash in the configured URL
  const endpoint = `${base}/rest/v1/hikes?select=${encodeURIComponent(SELECT)}`;
  const headers = { apikey: key };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchImpl(endpoint, {
    // Supabase publishable keys must go on the apikey header ONLY; sent as a
    // Bearer token they are parsed as a JWT and rejected ("Invalid JWT").
    headers,
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}

// All regions (read-only). Same apikey-header rule as fetchHikes.
export async function fetchRegions({ url, key }, fetchImpl = fetch, token = null) {
  const base = url.replace(/\/+$/, ""); // tolerate a trailing slash in the configured URL
  const endpoint = `${base}/rest/v1/regions?select=${encodeURIComponent(REGION_SELECT)}`;
  const headers = { apikey: key };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchImpl(endpoint, {
    // Supabase publishable keys must go on the apikey header ONLY; sent as a
    // Bearer token they are parsed as a JWT and rejected ("Invalid JWT").
    headers,
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}

// The signed-in user's own allowed_viewers row(s) (self-read RLS). Non-empty => allowlisted.
export async function fetchAllowedSelf({ url, key }, fetchImpl = fetch, token = null) {
  const base = url.replace(/\/+$/, "");
  const endpoint = `${base}/rest/v1/allowed_viewers?select=email,role`;
  const headers = { apikey: key };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchImpl(endpoint, { headers });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}
