// js/admin/gpx.js
// PURE: parse GPX text into a GeoJSON LineString. No DOM — regex/string parsing only,
// so it runs identically in the browser and under node:test.
import { lineDistanceMeters } from "../stats.js";

// All <trkpt ...> opening tags, falling back to <rtept ...> when there are no track points.
function pointTags(gpxText) {
  const trk = gpxText.match(/<trkpt\b[^>]*>/gi);
  if (trk && trk.length) return trk;
  return gpxText.match(/<rtept\b[^>]*>/gi) || [];
}

// Read one attribute out of a single tag string (order-independent; accepts ' or ").
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1] : null;
}

// Evenly sample down to exactly maxPoints, endpoints always included.
function decimate(coords, maxPoints) {
  const n = coords.length;
  if (maxPoints < 2) maxPoints = 2; // a LineString needs >= 2 points; avoids /0 below
  if (n <= maxPoints) return coords;
  const out = [];
  for (let k = 0; k < maxPoints; k++) {
    const i = Math.round((k * (n - 1)) / (maxPoints - 1));
    out.push(coords[i]);
  }
  return out;
}

export function gpxToLineString(gpxText, { maxPoints = 500 } = {}) {
  const tags = pointTags(String(gpxText || ""));
  const coords = [];
  for (const tag of tags) {
    const lat = parseFloat(attr(tag, "lat"));
    const lon = parseFloat(attr(tag, "lon"));
    if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lon, lat]);
  }
  if (coords.length < 2) throw new Error("GPX has fewer than 2 track points");
  return { type: "LineString", coordinates: decimate(coords, maxPoints) };
}

// Parse points WITH optional elevation (from child <ele>) for stats — independent of the
// decimated geometry, so distance reflects the FULL track. Falls back to <rtept>.
function pointsWithEle(gpxText) {
  let blocks = gpxText.match(/<trkpt\b[\s\S]*?(?:\/>|<\/trkpt>)/gi);
  if (!blocks || !blocks.length) blocks = gpxText.match(/<rtept\b[\s\S]*?(?:\/>|<\/rtept>)/gi) || [];
  const pts = [];
  for (const b of blocks) {
    const open = b.slice(0, b.indexOf(">") + 1); // read lat/lon from the opening tag only
    const lat = parseFloat(attr(open, "lat"));
    const lon = parseFloat(attr(open, "lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const em = b.match(/<ele>\s*([-+0-9.eE]+)\s*<\/ele>/i);
    const ele = em ? parseFloat(em[1]) : null;
    pts.push({ lon, lat, ele: Number.isFinite(ele) ? ele : null });
  }
  return pts;
}

// { distanceM, ascentM } : distance over the full track (rounded m); ascentM = summed positive
// <ele> deltas (rounded m), or null when fewer than 2 points carry elevation.
export function gpxStats(gpxText) {
  const pts = pointsWithEle(String(gpxText || ""));
  const distanceM = Math.round(lineDistanceMeters(pts.map((p) => [p.lon, p.lat])));
  let ascentM = null;
  if (pts.filter((p) => p.ele != null).length >= 2) {
    let asc = 0, prev = null;
    for (const p of pts) {
      if (p.ele == null) { prev = null; continue; }
      if (prev != null && p.ele > prev) asc += p.ele - prev;
      prev = p.ele;
    }
    ascentM = Math.round(asc);
  }
  return { distanceM, ascentM };
}
