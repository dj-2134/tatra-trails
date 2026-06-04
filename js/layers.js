// Pure config for Mapy.com tile layers — no DOM/browser deps, so it is unit-testable.
// Verified tile-URL pattern: https://api.mapy.com/v1/maptiles/{mapset}/{tileSize}/{z}/{x}/{y}?apikey=KEY

export const DEFAULT_MAPSET = "outdoor";

// `label` is shown in the Leaflet layer switcher.
export const MAPSETS = [
  { id: "outdoor", label: "Outdoor" },
  { id: "basic", label: "Basic" },
  { id: "aerial", label: "Aerial" },
  { id: "winter", label: "Winter" },
];

// Build a Mapy raster XYZ tile-URL template for Leaflet (Leaflet fills {z}/{x}/{y}).
export function mapsetUrl(mapset, apiKey, tileSize = 256) {
  return `https://api.mapy.com/v1/maptiles/${mapset}/${tileSize}/{z}/{x}/{y}?apikey=${apiKey}`;
}
