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
    end: seg && Array.isArray(seg.until) ? nearestPointIndex(coords, seg.until) : coords.length - 1,
  }));
  cuts.sort((a, b) => a.end - b.end); // out-of-order anchors are re-sorted, never an error

  const out = [];
  let from = 0;
  for (const cut of cuts) {
    const end = Math.max(cut.end, from);
    if (end > from || (from === 0 && end === coords.length - 1)) {
      if (end > from) out.push({ color: cut.color, style: cut.style, coords: coords.slice(from, end + 1) });
    }
    from = end; // shared boundary vertex: next slice starts where this one ended
  }
  if (from < coords.length - 1) {
    // Trailing stretch not covered by any segment (e.g. last `until` snapped early) — fallback.
    const last = cuts[cuts.length - 1];
    out.push({ color: last.color, style: last.style, coords: coords.slice(from) });
  }
  return out.length ? out : [all];
}
