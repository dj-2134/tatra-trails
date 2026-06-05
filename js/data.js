// js/data.js
// Thin read-only client for the Supabase PostgREST API. Config is passed in (not imported)
// so this module stays unit-testable without js/config.js present.
const SELECT =
  "slug,name_en,name_sk,geometry,seasonal_from,seasonal_to,seasonal_partial,note_en,note_sk,ref," +
  "closures(from_date,to_date,partial,reason_en,reason_sk,source)";

// config: { url, key } ; fetchImpl defaults to the global fetch (browser).
export async function fetchHikes({ url, key }, fetchImpl = fetch) {
  const base = url.replace(/\/+$/, ""); // tolerate a trailing slash in the configured URL
  const endpoint = `${base}/rest/v1/hikes?select=${encodeURIComponent(SELECT)}`;
  const res = await fetchImpl(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}
