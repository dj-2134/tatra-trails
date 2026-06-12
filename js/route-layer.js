// js/route-layer.js — shared Leaflet route rendering (white/dark casing + bright dashed
// line + start/finish flag markers), used by the public map (trails.js) and the admin map
// preview so routes look identical. Returns an UNATTACHED L.featureGroup; the caller adds
// it to a map, fits bounds, and removes it.
import { routeEndpoints } from "./route-endpoints.js";

const FLAG_W = 30, FLAG_H = 36;     // icon box in px
const ANCHOR_X = 4, ANCHOR_Y = 34;  // pole base inside the box — sits ON the endpoint

const GREEN = "#2e7d32", SLATE = "#37474f";

// Inline-SVG flags. The white casing strokes keep them readable on light AND dark tiles
// (same strategy as the route line's casing). kind: "start" | "end" | "startEnd".
function flagSvg(kind) {
  const poleColor = kind === "end" ? SLATE : GREEN;
  const pole =
    `<line x1="${ANCHOR_X}" y1="${ANCHOR_Y}" x2="${ANCHOR_X}" y2="6" stroke="#fff" stroke-width="5" stroke-linecap="round"/>` +
    `<line x1="${ANCHOR_X}" y1="${ANCHOR_Y}" x2="${ANCHOR_X}" y2="6" stroke="${poleColor}" stroke-width="3" stroke-linecap="round"/>` +
    `<circle cx="${ANCHOR_X}" cy="${ANCHOR_Y}" r="3.5" fill="${poleColor}" stroke="#fff" stroke-width="1.5"/>`;
  let cloth;
  if (kind === "start") {
    cloth = `<path d="M ${ANCHOR_X} 6 L 26 12.5 L ${ANCHOR_X} 19 Z" fill="${GREEN}" stroke="#fff" stroke-width="1.5"/>`;
  } else {
    // Checkered finish flag; the loop variant ("startEnd") keeps the green pole.
    cloth =
      `<rect x="4" y="6" width="22" height="13" fill="#fff" stroke="${poleColor}" stroke-width="1.5"/>` +
      `<rect x="4" y="6" width="5.5" height="6.5" fill="${SLATE}"/><rect x="15" y="6" width="5.5" height="6.5" fill="${SLATE}"/>` +
      `<rect x="9.5" y="12.5" width="5.5" height="6.5" fill="${SLATE}"/><rect x="20.5" y="12.5" width="5.5" height="6.5" fill="${SLATE}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FLAG_W}" height="${FLAG_H}" viewBox="0 0 ${FLAG_W} ${FLAG_H}">${pole}${cloth}</svg>`;
}

function flagMarker([lon, lat], kind, label) {
  const icon = L.divIcon({
    className: "endpoint-flag", // replaces Leaflet's default .leaflet-div-icon white box
    html: flagSvg(kind),
    iconSize: [FLAG_W, FLAG_H],
    iconAnchor: [ANCHOR_X, ANCHOR_Y],
  });
  const m = L.marker([lat, lon], { icon, keyboard: false });
  if (label) m.bindTooltip(label, { direction: "top", offset: [0, -30] });
  return m;
}

const DEFAULT_LABELS = { start: "Start", end: "End", startEnd: "Start & finish" };

export function routeLayer(geometry, status, { labels = DEFAULT_LABELS } = {}) {
  const casing = L.geoJSON(geometry, {
    style: { className: "trail-casing", weight: 10, opacity: 1, lineCap: "round", lineJoin: "round" },
  });
  const line = L.geoJSON(geometry, {
    style: { className: `trail trail--${status}`, weight: 6, opacity: 1, dashArray: "8 14", lineCap: "round", lineJoin: "round" },
  });
  const layers = [casing, line];
  const ends = routeEndpoints(geometry);
  if (ends) {
    if (ends.isLoop) {
      layers.push(flagMarker(ends.start, "startEnd", labels.startEnd));
    } else {
      layers.push(flagMarker(ends.start, "start", labels.start));
      layers.push(flagMarker(ends.end, "end", labels.end));
    }
  }
  return L.featureGroup(layers);
}
