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

// Google Maps "parking" search centered on a [lon, lat] point (note the lat,lon swap in
// the URL). The viewport-anchored /maps/search/parking/@lat,lon form searches AT the
// trailhead; the documented ?api=1&query="parking near …" form geocodes unreliably in
// remote areas.
export function parkingSearchUrl([lon, lat]) {
  return `https://www.google.com/maps/search/parking/@${lat},${lon},15z`;
}

// Google Maps pin at the exact [lon, lat] point (documented ?api=1&query= form; a
// coordinate query drops a marker there). Maps URLs can't combine a search AND a custom
// pin, hence two links: parkingSearchUrl finds parking, this one marks the trailhead.
export function trailheadPinUrl([lon, lat]) {
  return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}`;
}
