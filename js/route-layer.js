// js/route-layer.js — shared Leaflet route rendering (white/dark casing + bright dashed line),
// used by the public map (trails.js) and the admin map preview so routes look identical.
// Returns an UNATTACHED L.featureGroup; the caller adds it to a map, fits bounds, and removes it.
export function routeLayer(geometry, status) {
  const casing = L.geoJSON(geometry, {
    style: { className: "trail-casing", weight: 10, opacity: 1, lineCap: "round", lineJoin: "round" },
  });
  const line = L.geoJSON(geometry, {
    style: { className: `trail trail--${status}`, weight: 6, opacity: 1, dashArray: "8 14", lineCap: "round", lineJoin: "round" },
  });
  return L.featureGroup([casing, line]);
}
