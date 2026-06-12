// js/stats.js
// PURE hike-stat math — no DOM/Leaflet deps, so it is unit-testable.
const EARTH_RADIUS_M = 6371000;
const FLAT_MIN_PER_KM = 12;   // ~5 km/h on the flat (Naismith)
const ASCENT_MIN_PER_M = 0.1; // 1 hour per 600 m of ascent (60 / 600)

const toRad = (deg) => (deg * Math.PI) / 180;

// Great-circle distance between two [lon, lat] points, in meters. Exported for reuse
// (route-endpoints.js loop detection).
export function haversineMeters([lon1, lat1], [lon2, lat2]) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Total length of a [[lon,lat], …] line, in meters. < 2 points → 0.
export function lineDistanceMeters(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < coords.length; i++) sum += haversineMeters(coords[i - 1], coords[i]);
  return sum;
}

// Naismith walking-time estimate, whole minutes. Null/absent ascent counts as flat.
export function estimateDurationMin(distanceM, ascentM) {
  const d = Number(distanceM) || 0;
  const a = Number(ascentM) || 0;
  return Math.round((d / 1000) * FLAT_MIN_PER_KM + a * ASCENT_MIN_PER_M);
}
