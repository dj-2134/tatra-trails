// js/admin/gpx.js
// PURE: parse GPX text into a GeoJSON LineString. No DOM — regex/string parsing only,
// so it runs identically in the browser and under node:test.

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
