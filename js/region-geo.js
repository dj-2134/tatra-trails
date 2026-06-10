// js/region-geo.js — PURE geometry→region suggestion for the admin GPX flow. No DOM deps.
// Matches a track's representative points to the nearest region centroids (nearest-centroid).

// First, middle, and last [lon,lat] of a coordinate list, de-duplicated. <1 usable point → [].
export function representativePoints(coords) {
  const pts = (coords || []).filter(
    (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])
  );
  if (!pts.length) return [];
  const picked = [pts[0], pts[Math.floor((pts.length - 1) / 2)], pts[pts.length - 1]];
  const seen = new Set();
  const out = [];
  for (const p of picked) {
    const k = `${p[0]},${p[1]}`;
    if (!seen.has(k)) { seen.add(k); out.push(p); }
  }
  return out;
}

// Equirectangular squared distance (longitude scaled by latitude) — ample for "which is nearest".
function approxDistSq([lon1, lat1], [lon2, lat2]) {
  const k = Math.cos((lat1 * Math.PI) / 180);
  const dx = (lon2 - lon1) * k;
  const dy = lat2 - lat1;
  return dx * dx + dy * dy;
}

// The region whose (centroid_lon, centroid_lat) is closest to point. Regions without a finite
// centroid are ignored; null when none qualify.
export function nearestRegion(point, regions) {
  let best = null;
  let bestD = Infinity;
  for (const r of regions || []) {
    if (!r || !Number.isFinite(r.centroid_lon) || !Number.isFinite(r.centroid_lat)) continue;
    const d = approxDistSq(point, [r.centroid_lon, r.centroid_lat]);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

// De-duplicated region ids nearest the track's representative points. [] when none qualify.
export function suggestRegions(coords, regions) {
  const ids = [];
  for (const p of representativePoints(coords)) {
    const r = nearestRegion(p, regions);
    if (r && !ids.includes(r.id)) ids.push(r.id);
  }
  return ids;
}
