// js/waymarks.js
// PURE waymark/closure geometry math — no DOM/Leaflet deps, unit-testable.
// Coordinates are GeoJSON [lon, lat]. Anchors are stored coordinates clicked in the admin;
// they are snapped to the nearest route vertex at render time so GPX re-uploads can't
// orphan them (the route changes, anchors just re-snap).
import { haversineMeters } from "./stats.js";

export const WAYMARK_COLORS = ["red", "blue", "green", "yellow", "none"];

// Index of the route vertex nearest to [lon, lat]. Routes are decimated to ≤ ~500 points,
// so a linear scan is plenty.
export function nearestPointIndex(coords, point) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineMeters(coords[i], point);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Candidate vertex indices for a clicked/stored point on a possibly self-overlapping
// route: one representative (the locally nearest vertex) per contiguous run of vertices
// within tolM of the point. A lollipop's out-and-back legs yield one candidate per pass,
// in route order. Always contains at least the globally nearest vertex.
export function snapCandidates(coords, point, { tolM = 30 } = {}) {
  if (!Array.isArray(coords) || coords.length === 0) return [];
  // Compute all distances.
  const dists = coords.map((c) => haversineMeters(c, point));
  // Find global best distance.
  let bestD = Infinity;
  for (const d of dists) if (d < bestD) bestD = d;
  const limit = bestD + tolM;
  // Walk indices, group consecutive runs where d[i] <= limit, emit the min-distance index per run.
  const out = [];
  let inRun = false;
  let runBestIdx = -1;
  let runBestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    if (dists[i] <= limit) {
      if (!inRun) { inRun = true; runBestIdx = i; runBestD = dists[i]; }
      else if (dists[i] < runBestD) { runBestD = dists[i]; runBestIdx = i; }
    } else {
      if (inRun) { out.push(runBestIdx); inRun = false; runBestIdx = -1; runBestD = Infinity; }
    }
  }
  if (inRun) out.push(runBestIdx);
  // Guarantee at least the globally nearest index is present.
  if (out.length === 0) out.push(nearestPointIndex(coords, point));
  return out;
}

// Pass-aware anchor snap: anchor = [lon, lat] (legacy → first/global-nearest candidate)
// or [lon, lat, t] (t = stored route fraction → the candidate whose own fraction is
// closest to t, so anchors survive both GPX re-uploads AND self-overlapping passes).
export function snapAnchorIndex(coords, anchor) {
  const cands = snapCandidates(coords, anchor);
  if (anchor.length >= 3 && Number.isFinite(anchor[2])) {
    const n = coords.length - 1;
    let best = cands[0], bestDiff = Infinity;
    for (const idx of cands) {
      const diff = Math.abs(idx / n - anchor[2]);
      if (diff < bestDiff) { bestDiff = diff; best = idx; }
    }
    return best;
  }
  // Legacy 2-element: return candidates[0] which equals nearestPointIndex result.
  return cands[0];
}

function validGeometry(geometry) {
  return geometry && geometry.type === "LineString" && Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2 && Array.isArray(geometry.coordinates[0]);
}

// "none" is ALWAYS dashed (unmarked paths render like the base map draws them).
function normalizeSeg(seg) {
  const color = WAYMARK_COLORS.includes(seg && seg.color) ? seg.color : "none";
  const style = color === "none" ? "dashed" : (seg && seg.style === "dashed" ? "dashed" : "solid");
  return { color, style };
}

// geometry + stored waymark_segments -> [{ color, style, coords }] ready to draw.
// Adjacent slices share the boundary vertex so the polylines join seamlessly.
export function segmentPolylines(geometry, waymarkSegments) {
  if (!validGeometry(geometry)) return [];
  const coords = geometry.coordinates;
  const all = { color: "none", style: "dashed", coords };
  if (!Array.isArray(waymarkSegments) || waymarkSegments.length === 0) return [all];

  // Snap each segment's end anchor; the last segment (no `until`) runs to the route end.
  const cuts = waymarkSegments.map((seg) => ({
    ...normalizeSeg(seg),
    end: seg && Array.isArray(seg.until) ? snapAnchorIndex(coords, seg.until) : coords.length - 1,
  }));
  cuts.sort((a, b) => a.end - b.end); // out-of-order anchors are re-sorted, never an error

  const out = [];
  let from = 0;
  for (const cut of cuts) {
    const end = Math.max(cut.end, from);
    if (end > from) out.push({ color: cut.color, style: cut.style, coords: coords.slice(from, end + 1) });
    from = end; // shared boundary vertex: next slice starts where this one ended
  }
  if (from < coords.length - 1) {
    // Trailing stretch not covered by any segment (e.g. last `until` snapped early) — fallback.
    const last = cuts[cuts.length - 1];
    out.push({ color: last.color, style: last.style, coords: coords.slice(from) });
  }
  return out.length ? out : [all];
}

// The closed stretch between two stored anchors, normalized so click order doesn't matter.
// Returns [lon,lat][] or null (invalid input / both anchors on the same vertex).
export function closureStretch(geometry, from, to) {
  if (!validGeometry(geometry) || !Array.isArray(from) || !Array.isArray(to)) return null;
  const coords = geometry.coordinates;
  let a = snapAnchorIndex(coords, from);
  let b = snapAnchorIndex(coords, to);
  if (a > b) [a, b] = [b, a];
  if (a === b) return null;
  return coords.slice(a, b + 1);
}

// Marker positions along a stretch: one per ~spacingM meters, ≥1 (the midpoint), ≤15
// (a 30 km seasonal closure must not carpet the map). Walks cumulative distance and
// emits the vertex that crosses each next multiple of spacingM. Markers are deduplicated
// per vertex to avoid stacking when a single edge spans multiple spacing intervals.
export function closureMarkerPositions(stretchCoords, { spacingM = 400 } = {}) {
  if (!Array.isArray(stretchCoords) || stretchCoords.length < 2) return [];
  const out = [];
  let walked = 0;
  let next = spacingM;
  let lastIdx = -1; // a long edge crosses several thresholds — emit its vertex only once
  for (let i = 1; i < stretchCoords.length && out.length < 15; i++) {
    walked += haversineMeters(stretchCoords[i - 1], stretchCoords[i]);
    while (walked >= next && out.length < 15) {
      if (i !== lastIdx) { out.push(stretchCoords[i]); lastIdx = i; }
      next += spacingM;
    }
  }
  if (out.length === 0) out.push(stretchCoords[Math.floor(stretchCoords.length / 2)]);
  return out;
}

// Deduplicated (color,style) pairs in route order, for the list/detail swatches.
// "green, dashed green, green again" → two entries, not three.
export function swatchList(waymarkSegments) {
  if (!Array.isArray(waymarkSegments)) return [];
  const seen = new Set();
  const out = [];
  for (const seg of waymarkSegments) {
    const n = normalizeSeg(seg);
    const key = `${n.color}/${n.style}`;
    if (!seen.has(key)) { seen.add(key); out.push(n); }
  }
  return out;
}
