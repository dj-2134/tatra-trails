// js/route-endpoints.js
// PURE endpoint math for a hike's GeoJSON LineString — no DOM/Leaflet deps, unit-testable.
// Geometry is always a LineString (enforced by js/admin/validate.js), coordinates [lon, lat].
import { haversineMeters } from "./stats.js";

// Start/end of a LineString + whether it closes into a loop (endpoints ≤ loopThresholdM apart).
// Returns { start: [lon,lat], end: [lon,lat], isLoop } or null for missing/invalid geometry.
export function routeEndpoints(geometry, { loopThresholdM = 100 } = {}) {
  if (!geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;
  const coords = geometry.coordinates;
  if (coords.length < 2) return null;
  if (!Array.isArray(coords[0]) || !Array.isArray(coords[coords.length - 1])) return null;
  const start = coords[0];
  const end = coords[coords.length - 1];
  return { start, end, isLoop: haversineMeters(start, end) <= loopThresholdM };
}
