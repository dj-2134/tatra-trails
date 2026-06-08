// js/admin/store.js — hikes/closures CRUD over the shared supabase-js client. The client
// carries the admin session JWT, so these writes satisfy the user-scoped RLS (db/admin-rls.sql).
import { supabase } from "./auth.js";

// Hikes with their closures, ordered by English name, for the left pane + editor.
export async function listHikes() {
  const { data, error } = await supabase
    .from("hikes")
    .select(
      "id,slug,name_en,name_sk,geometry,seasonal_from,seasonal_to,seasonal_partial,note_en,note_sk,ref," +
        "closures(id,from_date,to_date,partial,reason_en,reason_sk,source)"
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
