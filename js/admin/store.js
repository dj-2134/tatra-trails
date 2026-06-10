// js/admin/store.js — hikes/closures CRUD over the shared supabase-js client. The client
// carries the admin session JWT, so these writes satisfy the user-scoped RLS (db/admin-rls.sql).
import { supabase } from "./auth.js";

// Hikes with their closures, ordered by English name, for the left pane + editor.
export async function listHikes() {
  const { data, error } = await supabase
    .from("hikes")
    .select(
      "id,slug,name_en,name_sk,geometry,seasonal_from,seasonal_to,seasonal_partial,note_en,note_sk,ref," +
        "distance_m,ascent_m,duration_min,is_public," +
        "closures(id,from_date,to_date,partial,reason_en,reason_sk,source)," +
        "hike_regions(region_id)"
    )
    .order("name_en");
  if (error) throw error;
  return data || [];
}

// Insert or update a hike by its unique slug. `hike` is column-shaped (no id needed).
// Returns the saved row including its id.
export async function upsertHike(hike) {
  const { data, error } = await supabase
    .from("hikes")
    .upsert(hike, { onConflict: "slug" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHike(id) {
  const { error } = await supabase.from("hikes").delete().eq("id", id);
  if (error) throw error; // closures cascade via the FK
}

// `closure` is column-shaped; include `id` to update, omit it to insert. hike_id is set here.
export async function upsertClosure(hikeId, closure) {
  const { data, error } = await supabase
    .from("closures")
    .upsert({ ...closure, hike_id: hikeId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteClosure(id) {
  const { error } = await supabase.from("closures").delete().eq("id", id);
  if (error) throw error;
}

// All regions, east→west (centroid_lon desc) for the picker + visibility list.
export async function listRegions() {
  const { data, error } = await supabase
    .from("regions")
    .select("id,slug,name_en,name_sk,kraj,centroid_lon,centroid_lat,is_public")
    .order("centroid_lon", { ascending: false, nullsFirst: false })
    .order("name_sk"); // tiebreak: match the public board's east→west + name_sk ordering
  if (error) throw error;
  return data || [];
}

// Replace a hike's region memberships with exactly regionIds (delete-all then insert).
export async function setHikeRegions(hikeId, regionIds) {
  const { error: delErr } = await supabase.from("hike_regions").delete().eq("hike_id", hikeId);
  if (delErr) throw delErr;
  const rows = (regionIds || []).map((region_id) => ({ hike_id: hikeId, region_id }));
  if (rows.length) {
    const { error: insErr } = await supabase.from("hike_regions").insert(rows);
    if (insErr) throw insErr;
  }
}

export async function setRegionPublic(regionId, isPublic) {
  const { error } = await supabase
    .from("regions")
    .update({ is_public: !!isPublic, updated_at: new Date().toISOString() })
    .eq("id", regionId);
  if (error) throw error;
}
