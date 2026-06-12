// js/route-layer.js — shared Leaflet route rendering (white/dark casing + per-segment
// waymark-styled lines + closure ✕ markers + start/finish flags), used by the public map
// (trails.js) and the admin map preview so routes look identical. Returns an UNATTACHED
// L.featureGroup; the caller adds it to a map, fits bounds, and removes it.
import { routeEndpoints } from "./route-endpoints.js";
import { segmentPolylines, closureStretch, closureMarkerPositions } from "./waymarks.js";

const FLAG_W = 30, FLAG_H = 40;     // icon box in px (taller than the art so the knob at y≈38 isn't clipped)
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
      `<rect x="${ANCHOR_X}" y="6" width="22" height="13" fill="#fff" stroke="${poleColor}" stroke-width="1.5"/>` +
      `<rect x="${ANCHOR_X}" y="6" width="5.5" height="6.5" fill="${SLATE}"/><rect x="15" y="6" width="5.5" height="6.5" fill="${SLATE}"/>` +
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
  // Leaflet sets tooltip content via innerHTML — only pass trusted strings (DICT labels), never user data.
  if (label) m.bindTooltip(label, { direction: "top", offset: [0, -30] });
  return m;
}

const DEFAULT_LABELS = { start: "Start", end: "End", startEnd: "Start & finish" };

// Red ✕ on a white disc, same casing/shadow strategy as the flags. label = pre-formatted
// closure text from the caller (route-layer is i18n-agnostic; trusted strings only —
// Leaflet tooltips go through innerHTML).
function closureMarker([lon, lat], label) {
  const icon = L.divIcon({
    className: "closure-x",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">` +
      `<circle cx="9" cy="9" r="8" fill="#fff" stroke="#b3261e" stroke-width="1.5"/>` +
      `<line x1="5.5" y1="5.5" x2="12.5" y2="12.5" stroke="#b3261e" stroke-width="2.5" stroke-linecap="round"/>` +
      `<line x1="5.5" y1="12.5" x2="12.5" y2="5.5" stroke="#b3261e" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
  const m = L.marker([lat, lon], { icon, keyboard: false });
  if (label) m.bindTooltip(label, { direction: "top", offset: [0, -12] });
  return m;
}

// opts.segments = hikes.waymark_segments (may be null → neutral dashed grey fallback).
// opts.closures = ACTIVE closures, each optionally carrying extent_from/extent_to and a
//   pre-formatted `label`. Marker rules: extent → that stretch; no extent + full closure →
//   whole route; no extent + partial → no markers (the badge still says partial).
// opts.dim → casing + lines at 0.4 opacity (admin marking mode); flags/✕ stay crisp.
export function routeLayer(geometry, { labels, segments, closures, dim = false } = {}) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const lineOpacity = dim ? 0.4 : 1;
  const layers = [
    L.geoJSON(geometry, {
      style: { className: "trail-casing", weight: 10, opacity: lineOpacity, lineCap: "round", lineJoin: "round" },
    }),
  ];
  for (const seg of segmentPolylines(geometry, segments)) {
    layers.push(L.polyline(seg.coords.map(([lon, lat]) => [lat, lon]), {
      className: `trail trail-wm--${seg.color}`,
      weight: 6, opacity: lineOpacity, lineCap: "round", lineJoin: "round",
      ...(seg.style === "dashed" ? { dashArray: "8 14" } : {}),
    }));
  }
  for (const c of closures || []) {
    let stretch = null;
    if (c.extent_from && c.extent_to) stretch = closureStretch(geometry, c.extent_from, c.extent_to);
    else if (!c.partial && geometry && Array.isArray(geometry.coordinates)) stretch = geometry.coordinates;
    if (!stretch) continue; // extent-less PARTIAL closures put nothing on the map by design
    for (const pos of closureMarkerPositions(stretch)) layers.push(closureMarker(pos, c.label));
  }
  const ends = routeEndpoints(geometry);
  if (ends) {
    if (ends.isLoop) {
      layers.push(flagMarker(ends.start, "startEnd", l.startEnd));
    } else {
      layers.push(flagMarker(ends.start, "start", l.start));
      layers.push(flagMarker(ends.end, "end", l.end));
    }
  }
  return L.featureGroup(layers);
}
