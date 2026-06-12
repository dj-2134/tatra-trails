// js/hikes.js
// Pure mapping from Supabase API rows to render-ready hikes (with computed status).
import { computeStatus } from "./status.js";
import { lineDistanceMeters } from "./stats.js";

function prepareHike(row, today) {
  const seasonal = row.seasonal_from && row.seasonal_to
    ? { from: row.seasonal_from, to: row.seasonal_to, partial: !!row.seasonal_partial,
        extent_from: row.seasonal_extent_from ?? null, extent_to: row.seasonal_extent_to ?? null }
    : null;
  const { status, activeClosures } = computeStatus(seasonal, row.closures || [], today);
  const note = row.note_en || row.note_sk ? { en: row.note_en || "", sk: row.note_sk || "" } : null;
  const distance_m = row.distance_m != null
    ? row.distance_m
    : (row.geometry && Array.isArray(row.geometry.coordinates)
        ? Math.round(lineDistanceMeters(row.geometry.coordinates))
        : null);
  return {
    slug: row.slug,
    name: { en: row.name_en, sk: row.name_sk },
    note,
    ref: row.ref || null,
    geometry: row.geometry,
    status,
    activeClosures,
    distance_m,
    ascent_m: row.ascent_m ?? null,
    duration_min: row.duration_min ?? null,
    region_ids: Array.isArray(row.hike_regions) ? row.hike_regions.map((x) => x.region_id) : [],
    is_public: row.is_public !== false,
    waymark_segments: row.waymark_segments ?? null,
  };
}

export function prepareHikes(rows, today) {
  return (rows || [])
    .filter((r) => r && r.slug && r.geometry)
    .map((r) => prepareHike(r, today));
}
