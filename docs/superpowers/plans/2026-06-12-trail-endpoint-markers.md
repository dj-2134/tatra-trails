# Trail Endpoint Markers + Parking Link (Increment E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start/finish flag markers on the selected trail (public map + admin preview), a "Parking near trailhead" Google-Maps link in the detail panel, and the "founder account" → "owner account" admin string fix.

**Architecture:** A new pure module `js/route-endpoints.js` (TDD) extracts start/end/loop info from a hike's GeoJSON LineString and builds the parking-search URL. The shared `js/route-layer.js` (Leaflet glue, manual-verify) grows inline-SVG `divIcon` flag markers, so the admin preview gets them for free. `js/trails.js` passes localized tooltip labels and renders the parking link row. Frontend only — no DB changes, no migrations, no image assets.

**Tech Stack:** Vanilla ES modules, Leaflet (global `L`), `node --test` + `node:assert/strict`. Spec: `docs/superpowers/specs/2026-06-12-trail-endpoint-markers-design.md`.

---

## Repo gotchas (read first)

- All commands run from the repo root: `C:\Users\Dano\Downloads\claude\tatra-trails`.
- **`git add` only the exact files named in each task.** `db/admin-rls.sql` and `db/friends-access.sql` have intentional uncommitted local diffs — they must NEVER be staged.
- **Pushing `master` auto-deploys to GitHub Pages.** Commit locally per task; do NOT `git push` — the final push is a user-gated step (Task 7).
- Manual browser checks: serve the repo root statically (e.g. `python -m http.server 8000`), open `http://localhost:8000`, and **hard-refresh (Ctrl+Shift+R)** after every JS change — the browser caches ES modules and stale modules blank the page with a misleading `SyntaxError ... doesn't provide an export` error.
- `js/config.js` is gitignored but exists locally with the Supabase URL/key — the app runs against the live DB.

## File structure

| File | Action | Responsibility |
|---|---|---|
| `js/stats.js` | Modify | Export the existing private `haversineMeters` (no behavior change) |
| `js/route-endpoints.js` | Create | PURE: `routeEndpoints(geometry, opts)` + `parkingSearchUrl([lon,lat])` |
| `tests/route-endpoints.test.js` | Create | Unit tests for the new module |
| `tests/stats.test.js` | Modify | Tests for the newly exported `haversineMeters` |
| `js/route-layer.js` | Modify | Flag markers (divIcon inline SVG) appended to the shared feature group |
| `css/styles.css` | Modify | `.endpoint-flag` drop shadow; `.detail-parking` row styling |
| `js/i18n.js` | Modify | 4 new DICT keys (parking label + 3 marker tooltips) |
| `js/trails.js` | Modify | Localized labels into `routeLayer()`; redraw on langchange; parking link row |
| `js/admin/ui.js` | Modify | `errorText`: "founder account" → "owner account" |

---

### Task 1: Export `haversineMeters` from `js/stats.js`

**Files:**
- Modify: `js/stats.js:10` (add `export`)
- Test: `tests/stats.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/stats.test.js`:

```js
test("haversineMeters: ~111.2 km per degree of latitude", () => {
  const d = haversineMeters([20, 49], [20, 50]);
  assert.ok(Math.abs(d - 111195) < 500, `got ${d}`);
});

test("haversineMeters: zero for identical points", () => {
  assert.equal(haversineMeters([20.06, 49.12], [20.06, 49.12]), 0);
});
```

And change the import at the top of the file to:

```js
import { lineDistanceMeters, estimateDurationMin, haversineMeters } from "../js/stats.js";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/stats.test.js`
Expected: FAIL — `SyntaxError: The requested module '../js/stats.js' does not provide an export named 'haversineMeters'`

- [ ] **Step 3: Minimal implementation**

In `js/stats.js` line 10, change:

```js
function haversineMeters([lon1, lat1], [lon2, lat2]) {
```

to:

```js
export function haversineMeters([lon1, lat1], [lon2, lat2]) {
```

Also update the comment above it (line 9) to note it is exported for reuse:

```js
// Great-circle distance between two [lon, lat] points, in meters. Exported for reuse
// (route-endpoints.js loop detection).
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/stats.test.js`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add js/stats.js tests/stats.test.js
git commit -m "feat(stats): export haversineMeters for endpoint loop detection (E)"
```

---

### Task 2: Pure module `js/route-endpoints.js` — `routeEndpoints()`

**Files:**
- Create: `js/route-endpoints.js`
- Create: `tests/route-endpoints.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/route-endpoints.test.js`:

```js
// tests/route-endpoints.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { routeEndpoints } from "../js/route-endpoints.js";

const line = (coords) => ({ type: "LineString", coordinates: coords });

test("routeEndpoints: start = first point, end = last point, not a loop", () => {
  const r = routeEndpoints(line([[20.06, 49.12], [20.07, 49.13], [20.09, 49.15]]));
  assert.deepEqual(r.start, [20.06, 49.12]);
  assert.deepEqual(r.end, [20.09, 49.15]);
  assert.equal(r.isLoop, false);
});

test("routeEndpoints: loop when endpoints are within 100 m", () => {
  // 0.0005° of latitude ≈ 56 m
  const r = routeEndpoints(line([[20.06, 49.12], [20.10, 49.15], [20.06, 49.1205]]));
  assert.equal(r.isLoop, true);
});

test("routeEndpoints: not a loop just over the threshold", () => {
  // 0.0012° of latitude ≈ 133 m
  const r = routeEndpoints(line([[20.06, 49.12], [20.10, 49.15], [20.06, 49.1212]]));
  assert.equal(r.isLoop, false);
});

test("routeEndpoints: loopThresholdM is configurable", () => {
  const g = line([[20.06, 49.12], [20.10, 49.15], [20.06, 49.1212]]); // ≈133 m apart
  assert.equal(routeEndpoints(g, { loopThresholdM: 150 }).isLoop, true);
});

test("routeEndpoints: null on missing/invalid/short geometry", () => {
  assert.equal(routeEndpoints(null), null);
  assert.equal(routeEndpoints(undefined), null);
  assert.equal(routeEndpoints({}), null);
  assert.equal(routeEndpoints({ type: "MultiLineString", coordinates: [[[20, 49], [21, 49]]] }), null);
  assert.equal(routeEndpoints(line([])), null);
  assert.equal(routeEndpoints(line([[20, 49]])), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/route-endpoints.test.js`
Expected: FAIL — `Cannot find module ... js/route-endpoints.js`

- [ ] **Step 3: Minimal implementation**

Create `js/route-endpoints.js`:

```js
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
  const start = coords[0];
  const end = coords[coords.length - 1];
  return { start, end, isLoop: haversineMeters(start, end) <= loopThresholdM };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/route-endpoints.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add js/route-endpoints.js tests/route-endpoints.test.js
git commit -m "feat(map): pure routeEndpoints — start/end/loop from a LineString (E)"
```

---

### Task 3: `parkingSearchUrl()` in `js/route-endpoints.js`

**Files:**
- Modify: `js/route-endpoints.js` (append)
- Test: `tests/route-endpoints.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/route-endpoints.test.js` (and add `parkingSearchUrl` to the import at the top):

```js
import { routeEndpoints, parkingSearchUrl } from "../js/route-endpoints.js";
```

```js
test("parkingSearchUrl: lat comes before lon in the URL (GeoJSON order is swapped)", () => {
  assert.equal(
    parkingSearchUrl([20.0604, 49.1196]),
    "https://www.google.com/maps/search/parking/@49.1196,20.0604,15z",
  );
});

test("parkingSearchUrl: integer coordinates pass through unchanged", () => {
  assert.equal(parkingSearchUrl([20, 49]), "https://www.google.com/maps/search/parking/@49,20,15z");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/route-endpoints.test.js`
Expected: FAIL — `does not provide an export named 'parkingSearchUrl'`

- [ ] **Step 3: Minimal implementation**

Append to `js/route-endpoints.js`:

```js
// Google Maps "parking" search centered on a [lon, lat] point (note the lat,lon swap in
// the URL). The viewport-anchored /maps/search/parking/@lat,lon form searches AT the
// trailhead; the documented ?api=1&query="parking near …" form geocodes unreliably in
// remote areas.
export function parkingSearchUrl([lon, lat]) {
  return `https://www.google.com/maps/search/parking/@${lat},${lon},15z`;
}
```

- [ ] **Step 4: Run the full suite**

Run: `node --test`
Expected: PASS — no regressions, all files green.

- [ ] **Step 5: Commit**

```bash
git add js/route-endpoints.js tests/route-endpoints.test.js
git commit -m "feat(map): parkingSearchUrl — Google Maps parking search at the trailhead (E)"
```

---

### Task 4: Flag markers in the shared `js/route-layer.js` + CSS

Leaflet glue — no unit tests (project convention); verified manually in Task 7.

**Files:**
- Modify: `js/route-layer.js` (full rewrite below)
- Modify: `css/styles.css` (append after the route-stroke block, currently ending line 164)

- [ ] **Step 1: Rewrite `js/route-layer.js`**

Replace the entire file with:

```js
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
```

Notes for the implementer:
- The signature stays backward-compatible: both existing call sites (`js/trails.js:253`, `js/admin/ui.js:313`) pass two args and now get English-labeled markers automatically.
- `routeEndpoints()` returning `null` (no/invalid geometry) renders exactly what the file rendered before — casing + line only.

- [ ] **Step 2: Append CSS**

In `css/styles.css`, directly after `path.trail--partial { stroke: #ff9100; }` (line 164), add:

```css
/* Endpoint flags: white outline is baked into the SVG (casing strategy); the drop shadow
   lifts them off the tiles in both themes, matching the route casing. */
.endpoint-flag { filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .45)); }
.endpoint-flag svg { display: block; }
```

- [ ] **Step 3: Run the full suite (regression only — no new tests)**

Run: `node --test`
Expected: PASS — same count as after Task 3.

- [ ] **Step 4: Commit**

```bash
git add js/route-layer.js css/styles.css
git commit -m "feat(map): start/finish flag markers in the shared route layer (E)"
```

---

### Task 5: Public board — localized tooltips, langchange redraw, parking link

Glue + dictionary — covered by the existing DICT completeness test plus manual checks in Task 7.

**Files:**
- Modify: `js/i18n.js` (4 new keys, after `"detail.walkingTime"` on line 29)
- Modify: `js/trails.js` (import block line 8-ish; langchange handler lines 80-83; `drawRoute` lines 251-256; `openDetail` after the stats block ending line 298)

- [ ] **Step 1: Add DICT keys**

In `js/i18n.js`, after the `"detail.walkingTime"` line, insert:

```js
  "detail.parking": { en: "Parking near trailhead", sk: "Parkovanie pri štarte" },
  "marker.start": { en: "Start", sk: "Štart" },
  "marker.end": { en: "End", sk: "Cieľ" },
  "marker.startEnd": { en: "Start & finish", sk: "Štart a cieľ" },
```

- [ ] **Step 2: Run the i18n suite (the completeness test covers the new keys)**

Run: `node --test tests/i18n.test.js`
Expected: PASS — "the real dictionary has both languages for every key" stays green.

- [ ] **Step 3: Wire trails.js**

(a) Add to the imports at the top of `js/trails.js`:

```js
import { routeEndpoints, parkingSearchUrl } from "./route-endpoints.js";
```

(b) Replace the `tt:langchange` handler (currently lines 80-83):

```js
  document.addEventListener("tt:langchange", () => {
    renderList();
    if (SELECTED) {
      const hike = HIKES.find((h) => h.slug === SELECTED);
      if (hike) drawRoute(hike); // marker tooltips follow the language
      openDetail(SELECTED);
    }
  });
```

(c) Replace `drawRoute` (currently lines 251-256):

```js
function drawRoute(hike) {
  if (ROUTE_LAYER) { MAP.removeLayer(ROUTE_LAYER); ROUTE_LAYER = null; }
  const labels = {
    start: t(DICT, "marker.start", lang()),
    end: t(DICT, "marker.end", lang()),
    startEnd: t(DICT, "marker.startEnd", lang()),
  };
  ROUTE_LAYER = routeLayer(hike.geometry, hike.status, { labels }).addTo(MAP);
  const bounds = ROUTE_LAYER.getBounds();
  if (bounds.isValid()) MAP.fitBounds(bounds, { padding: [40, 40] });
}
```

(d) In `openDetail`, directly after the stats block (after the `if (statItems.length) { ... panel.appendChild(stats); }` closing brace, currently line 298), insert:

```js
  const ends = routeEndpoints(hike.geometry);
  if (ends) {
    const parking = document.createElement("div");
    parking.className = "detail-parking";
    const a = document.createElement("a");
    a.href = parkingSearchUrl(ends.start);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = `🅿 ${t(DICT, "detail.parking", L_)} ↗`;
    parking.appendChild(a);
    panel.appendChild(parking);
  }
```

(e) In `css/styles.css`, after the `.endpoint-flag` block added in Task 4, add:

```css
.trail-detail .detail-parking {
  font-size: 13px;
  border-top: 1px solid var(--chrome-border);
  padding-top: 8px;
}
```

- [ ] **Step 4: Syntax check + full suite**

Run: `node --check js/trails.js; node --test`
Expected: clean check; full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add js/i18n.js js/trails.js css/styles.css
git commit -m "feat(board): parking link in detail + localized endpoint tooltips (E)"
```

---

### Task 6: Admin string fix — "founder account" → "owner account"

**Files:**
- Modify: `js/admin/ui.js:418`

- [ ] **Step 1: Edit the string**

In `js/admin/ui.js` `errorText()` (line 418), change:

```js
  if (/jwt|401|403|row-level|policy|permission/i.test(m)) return "Not authorized — sign in with the founder account.";
```

to:

```js
  if (/jwt|401|403|row-level|policy|permission/i.test(m)) return "Not authorized — sign in with the owner account.";
```

- [ ] **Step 2: Syntax check**

Run: `node --check js/admin/ui.js`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add js/admin/ui.js
git commit -m "fix(admin): errorText says owner account, matching the D2 role model (E)"
```

---

### Task 7: Final verification (manual checklist + user-gated push)

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `node --test`
Expected: PASS — every file green, no skips.

- [ ] **Step 2: Manual browser checklist**

Serve the repo root (`python -m http.server 8000`), open `http://localhost:8000`, **hard-refresh (Ctrl+Shift+R)**, then verify:

1. Select a point-to-point hike → green start flag + checkered end flag, planted on the route ends at every zoom level.
2. Select a loop hike (e.g. the lakeside loop) → ONE combined flag (checkered cloth, green pole), tooltip "Start & finish".
3. Hover/tap flags → tooltips "Start" / "End" (EN).
4. Detail panel shows "🅿 Parking near trailhead ↗" under the stats; click → Google Maps opens in a new tab with a parking search centered on the trailhead.
5. Switch language to SK → tooltips "Štart" / "Cieľ" (re-select or just switch — the route redraws), link label "Parkovanie pri štarte".
6. Toggle dark mode → flags legible on dark tiles.
7. Open `http://localhost:8000/admin.html`, sign in, pick a hike with a route → the admin preview shows the same flags (English tooltips).
8. A hike with no geometry → no flags, no parking row, no console errors.
9. Trigger an admin auth error path (or eyeball the string) → "owner account".

- [ ] **Step 3: STOP — user-gated push**

Report results to the user. **Do not `git push`.** Pushing `master` deploys to GitHub Pages; the user pushes (or asks for the push) after they're happy with the local verification.

---

## Self-review notes

- Spec coverage: markers both maps (T4), combined loop marker (T2 logic + T4 rendering), parking link in detail (T5), URL form + lat/lon swap (T3), i18n incl. langchange redraw (T5), edge cases no-geometry/short-geometry (T2 null path, T5 guard), admin string (T6), TDD pure / manual glue split (T1-T3 vs T4-T5), no DB changes (none anywhere).
- Types consistent: `[lon, lat]` everywhere in pure code; the swap to Leaflet's `[lat, lon]` happens only inside `flagMarker()` and `parkingSearchUrl()`, both commented.
