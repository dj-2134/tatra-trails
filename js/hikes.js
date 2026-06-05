// js/hikes.js
// Pure mapping from Supabase API rows to render-ready hikes (with computed status).
import { computeStatus } from "./status.js";

function prepareHike(row, today) {
  const seasonal = row.seasonal_from && row.seasonal_to
    ? { from: row.seasonal_from, to: row.seasonal_to, partial: !!row.seasonal_partial }
    : null;
  const { status, activeClosures } = computeStatus(seasonal, row.closures || [], today);
  const note = row.note_en || row.note_sk ? { en: row.note_en || "", sk: row.note_sk || "" } : null;
  return {
    slug: row.slug,
    name: { en: row.name_en, sk: row.name_sk },
    note,
    ref: row.ref || null,
    geometry: row.geometry,
    status,
    activeClosures,
  };
}

export function prepareHikes(rows, today) {
  return (rows || [])
    .filter((r) => r && r.slug && r.geometry)
    .map((r) => prepareHike(r, today));
}
