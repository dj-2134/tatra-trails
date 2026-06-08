# Hike Stats (Increment A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each hike's distance, elevation gain, and walking time on the public board (detail panel + compact list row) and in the admin editor, auto-derived from the uploaded GPX with manual override, plus a metric/imperial toggle and a route map preview in the admin.

**Architecture:** Pure, unit-tested math/format modules (`stats.js`, `stats-format.js`, `units.js`) plus a `gpxStats` extension; thin DOM/Leaflet glue wires them into the public site and the admin (manually verified, like `trails.js`). New nullable `hikes` columns store the values; distance falls back to client-side geometry computation when unstored.

**Tech Stack:** Plain ES modules (no build step), `node:test`, Supabase Postgres, Leaflet (already used by the public map), GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-06-08-hike-stats-design.md`

---

## File Structure

**New (pure, unit-tested):**
- `js/stats.js` — `lineDistanceMeters(coords)` (haversine), `estimateDurationMin(distanceM, ascentM)` (Naismith).
- `js/stats-format.js` — `formatDistance(m, units)`, `formatAscent(m, units)`, `formatDuration(min)`.
- `js/units.js` — `UNITS`, `DEFAULT_UNITS`, `resolveUnits(stored)`, `nextUnits(current)` (mirrors `theme.js`).

**New (glue):**
- `js/route-layer.js` — `routeLayer(geometry, status)` → unattached Leaflet `featureGroup` (casing + dashed line), used by both maps.

**Modified:**
- `db/schema.sql` (+3 columns); **new** `db/add-hike-stats.sql` (live-DB migration).
- `js/admin/gpx.js` — add `gpxStats(gpxText)` (reads child `<ele>`); imports `lineDistanceMeters` from `../stats.js`.
- `js/data.js` (+3 columns in SELECT); `js/hikes.js` (map fields + distance fallback).
- `js/trails.js` (render stats; `tt:unitchange` listener; draw via `routeLayer`).
- `js/i18n.js` (add stat labels; remove `panel.planRoute`/`panel.comingSoon`).
- `index.html` (units chip; remove coming-soon `.panel-section`); `js/ui.js` (`initUnits` glue).
- `admin.html` (Leaflet + `#admin-map` + 3 stat fields); `js/admin/ui.js` (map preview, GPX pre-fill, load/save); `js/admin/store.js` (+3 columns); `js/admin/validate.js` (stat validation).
- `css/styles.css` (admin map, stats lines, list-row layout, units chip).

---

## Task 1: DB columns + migration

**Files:**
- Create: `db/add-hike-stats.sql`
- Modify: `db/schema.sql`

No automated test (DB/dashboard). The migration is run once by the founder in the Supabase SQL Editor.

- [ ] **Step 1: Create the migration**

Create `db/add-hike-stats.sql`:

```sql
-- db/add-hike-stats.sql — Increment A: per-hike stats. Run ONCE in Supabase Studio → SQL
-- Editor (safe to re-run). RLS is unchanged — existing policies already cover all columns.
alter table hikes
  add column if not exists distance_m   integer check (distance_m   is null or distance_m   >= 0),
  add column if not exists ascent_m     integer check (ascent_m     is null or ascent_m     >= 0),
  add column if not exists duration_min integer check (duration_min is null or duration_min >= 0);
```

- [ ] **Step 2: Update the schema for fresh setups**

In `db/schema.sql`, add the three columns to the `create table hikes` block (after the `ref text,` line, before `created_at`):

```sql
  ref text,
  distance_m   integer check (distance_m   is null or distance_m   >= 0),
  ascent_m     integer check (ascent_m     is null or ascent_m     >= 0),
  duration_min integer check (duration_min is null or duration_min >= 0),
  created_at timestamptz not null default now(),
```

- [ ] **Step 3: Commit**

```bash
git add db/add-hike-stats.sql db/schema.sql
git commit -m "feat(stats): hikes distance_m/ascent_m/duration_min columns + migration"
```

(Append the Co-Authored-By footer used by this repo to all commits in this plan.)

---

## Task 2: `js/stats.js` — pure distance + duration math (TDD)

**Files:**
- Create: `js/stats.js`
- Test: `tests/stats.test.js`

- [ ] **Step 1: Write the failing test** — create `tests/stats.test.js`:

```js
// tests/stats.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineDistanceMeters, estimateDurationMin } from "../js/stats.js";

test("lineDistanceMeters: 1° of latitude is ~111.2 km", () => {
  const d = lineDistanceMeters([[20, 49], [20, 50]]);
  assert.ok(Math.abs(d - 111195) < 500, `got ${d}`);
});

test("lineDistanceMeters: sums consecutive segments", () => {
  const d = lineDistanceMeters([[20, 49], [20, 49.5], [20, 50]]);
  assert.ok(Math.abs(d - 111195) < 1000, `got ${d}`);
});

test("lineDistanceMeters: fewer than 2 points is 0", () => {
  assert.equal(lineDistanceMeters([]), 0);
  assert.equal(lineDistanceMeters([[20, 49]]), 0);
  assert.equal(lineDistanceMeters(null), 0);
});

test("estimateDurationMin: 10 km + 600 m ascent = 180 min (Naismith)", () => {
  assert.equal(estimateDurationMin(10000, 600), 180);
});

test("estimateDurationMin: flat 10 km = 120 min; null ascent counts as flat", () => {
  assert.equal(estimateDurationMin(10000, 0), 120);
  assert.equal(estimateDurationMin(10000, null), 120);
});
```

- [ ] **Step 2: Run it — `node --test tests/stats.test.js` → FAIL** (module not found).

- [ ] **Step 3: Implement** — create `js/stats.js`:

```js
// js/stats.js
// PURE hike-stat math — no DOM/Leaflet deps, so it is unit-testable.
const EARTH_RADIUS_M = 6371000;
const FLAT_MIN_PER_KM = 12;   // ~5 km/h on the flat (Naismith)
const ASCENT_MIN_PER_M = 0.1; // 1 hour per 600 m of ascent (60 / 600)

const toRad = (deg) => (deg * Math.PI) / 180;

// Great-circle distance between two [lon, lat] points, in meters.
function haversineMeters([lon1, lat1], [lon2, lat2]) {
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
```

- [ ] **Step 4: Run it — `node --test tests/stats.test.js` → PASS** (5 tests).

- [ ] **Step 5: Commit**

```bash
git add js/stats.js tests/stats.test.js
git commit -m "feat(stats): pure haversine distance + Naismith duration"
```

---

## Task 3: `js/stats-format.js` — pure units-aware formatters (TDD)

**Files:**
- Create: `js/stats-format.js`
- Test: `tests/stats-format.test.js`

- [ ] **Step 1: Write the failing test** — create `tests/stats-format.test.js`:

```js
// tests/stats-format.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDistance, formatAscent, formatDuration } from "../js/stats-format.js";

test("formatDistance: metric km and imperial miles, null → ''", () => {
  assert.equal(formatDistance(12300, "metric"), "12.3 km");
  assert.equal(formatDistance(12300, "imperial"), "7.6 mi");
  assert.equal(formatDistance(null), "");
});

test("formatAscent: ↑ prefix, metric m and imperial ft (grouped), null → ''", () => {
  assert.equal(formatAscent(540, "metric"), "↑540 m");
  assert.equal(formatAscent(540, "imperial"), "↑1,772 ft");
  assert.equal(formatAscent(null), "");
});

test("formatDuration: under an hour, exact hour, h+min, null → ''", () => {
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(120), "2 h");
  assert.equal(formatDuration(210), "3 h 30 min");
  assert.equal(formatDuration(null), "");
});
```

- [ ] **Step 2: Run it — `node --test tests/stats-format.test.js` → FAIL.**

- [ ] **Step 3: Implement** — create `js/stats-format.js`:

```js
// js/stats-format.js
// PURE display formatters for hike stats. Language-neutral (km/m/mi/ft/h/min/↑); `units`
// is "metric" | "imperial". Null / non-finite inputs → "" so callers can skip cleanly.
const M_PER_MILE = 1609.344;
const FT_PER_M = 3.28084;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// 1770 → "1,770". Deterministic, no locale dependency.
const groupThousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function formatDistance(m, units = "metric") {
  if (!isNum(m)) return "";
  return units === "imperial" ? `${(m / M_PER_MILE).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`;
}

export function formatAscent(m, units = "metric") {
  if (!isNum(m)) return "";
  return units === "imperial"
    ? `↑${groupThousands(Math.round(m * FT_PER_M))} ft`
    : `↑${Math.round(m)} m`;
}

// Units-independent (time is time).
export function formatDuration(min) {
  if (!isNum(min) || min < 0) return "";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
```

- [ ] **Step 4: Run it — `node --test tests/stats-format.test.js` → PASS** (3 tests).

- [ ] **Step 5: Commit**

```bash
git add js/stats-format.js tests/stats-format.test.js
git commit -m "feat(stats): pure units-aware stat formatters"
```

---

## Task 4: `js/units.js` — pure units resolution (TDD)

**Files:**
- Create: `js/units.js`
- Test: `tests/units.test.js`

- [ ] **Step 1: Write the failing test** — create `tests/units.test.js`:

```js
// tests/units.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { UNITS, DEFAULT_UNITS, resolveUnits, nextUnits } from "../js/units.js";

test("units are metric/imperial, default metric", () => {
  assert.deepEqual(UNITS, ["metric", "imperial"]);
  assert.equal(DEFAULT_UNITS, "metric");
});

test("resolveUnits: a valid stored value wins, otherwise metric", () => {
  assert.equal(resolveUnits("imperial"), "imperial");
  assert.equal(resolveUnits("metric"), "metric");
  assert.equal(resolveUnits(null), "metric");
  assert.equal(resolveUnits("furlongs"), "metric");
});

test("nextUnits toggles", () => {
  assert.equal(nextUnits("metric"), "imperial");
  assert.equal(nextUnits("imperial"), "metric");
});
```

- [ ] **Step 2: Run it — `node --test tests/units.test.js` → FAIL.**

- [ ] **Step 3: Implement** — create `js/units.js`:

```js
// js/units.js — PURE units resolution (metric/imperial). No browser deps; mirrors theme.js.
export const UNITS = ["metric", "imperial"];
export const DEFAULT_UNITS = "metric";

export function resolveUnits(stored) {
  return UNITS.includes(stored) ? stored : DEFAULT_UNITS;
}

export function nextUnits(current) {
  return current === "imperial" ? "metric" : "imperial";
}
```

- [ ] **Step 4: Run it — `node --test tests/units.test.js` → PASS** (3 tests).

- [ ] **Step 5: Commit**

```bash
git add js/units.js tests/units.test.js
git commit -m "feat(stats): pure metric/imperial units resolution"
```

---

## Task 5: `gpxStats` in `js/admin/gpx.js` (TDD)

**Files:**
- Modify: `js/admin/gpx.js`
- Test: `tests/gpx.test.js` (extend)

Elevation is a **child element** `<ele>…</ele>` inside `<trkpt>…</trkpt>`, not an attribute — so this parses whole point *blocks*, unlike `gpxToLineString` which only needs the opening-tag lat/lon.

- [ ] **Step 1: Add the failing tests** — append to `tests/gpx.test.js`, and update its import line:

Change the existing import at the top of `tests/gpx.test.js`:
```js
import { gpxToLineString, gpxStats } from "../js/admin/gpx.js";
```
Append:
```js
test("gpxStats: distance + ascent from a track that has <ele> children", () => {
  const gpx = `<gpx><trk><trkseg>
    <trkpt lat="49.0" lon="20.0"><ele>1000</ele></trkpt>
    <trkpt lat="49.0" lon="20.01"><ele>1100</ele></trkpt>
    <trkpt lat="49.0" lon="20.02"><ele>1050</ele></trkpt>
  </trkseg></trk></gpx>`;
  const { distanceM, ascentM } = gpxStats(gpx);
  assert.ok(distanceM > 1000 && distanceM < 2000, `distance ${distanceM}`);
  assert.equal(ascentM, 100); // +100 then -50 → ascent 100
});

test("gpxStats: ascent is null when the track has no elevation", () => {
  const gpx = `<gpx><trk><trkseg><trkpt lat="49.0" lon="20.0"/><trkpt lat="49.0" lon="20.01"/></trkseg></trk></gpx>`;
  const { distanceM, ascentM } = gpxStats(gpx);
  assert.ok(distanceM > 0);
  assert.equal(ascentM, null);
});
```

- [ ] **Step 2: Run it — `node --test tests/gpx.test.js` → FAIL** (`gpxStats` is not exported).

- [ ] **Step 3: Implement** — in `js/admin/gpx.js`, add the import at the top (below the file's header comment) and append the new function. The import:

```js
import { lineDistanceMeters } from "../stats.js";
```

Append at the end of the file:

```js
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
```

- [ ] **Step 4: Run it — `node --test tests/gpx.test.js` → PASS** (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add js/admin/gpx.js tests/gpx.test.js
git commit -m "feat(stats): gpxStats — full-track distance + <ele> ascent"
```

---

## Task 6: Public read path — `js/data.js` SELECT + `js/hikes.js` mapping (TDD)

**Files:**
- Modify: `js/data.js`
- Modify: `js/hikes.js`
- Test: `tests/hikes.test.js` (extend); `tests/data.test.js` (extend)

- [ ] **Step 1: Add the failing tests.**

Append to `tests/hikes.test.js` (it already imports `prepareHikes` and defines a `today`; reuse them):
```js
test("prepareHikes: maps stat fields and falls back to geometry distance", () => {
  const geom = { type: "LineString", coordinates: [[20, 49], [20, 50]] }; // ~111 km
  const [a, b] = prepareHikes([
    { slug: "a", name_en: "A", name_sk: "A", geometry: geom, ascent_m: 540, duration_min: 210 },
    { slug: "b", name_en: "B", name_sk: "B", geometry: geom, distance_m: 5000 },
  ], today);
  assert.ok(Math.abs(a.distance_m - 111195) < 1000, `fallback ${a.distance_m}`);
  assert.equal(a.ascent_m, 540);
  assert.equal(a.duration_min, 210);
  assert.equal(b.distance_m, 5000); // an explicit value wins over the fallback
  assert.equal(b.ascent_m, null);
});
```
Append to `tests/data.test.js`:
```js
test("fetchHikes requests the stat columns", async () => {
  let captured;
  const stub = async (url) => { captured = url; return { ok: true, status: 200, json: async () => [] }; };
  await fetchHikes({ url: "https://p.supabase.co", key: "K" }, stub);
  assert.match(decodeURIComponent(captured), /distance_m,ascent_m,duration_min/);
});
```

- [ ] **Step 2: Run — `node --test tests/hikes.test.js tests/data.test.js` → FAIL.**

- [ ] **Step 3: Implement.**

In `js/data.js`, update the `SELECT` constant:
```js
const SELECT =
  "slug,name_en,name_sk,geometry,seasonal_from,seasonal_to,seasonal_partial,note_en,note_sk,ref," +
  "distance_m,ascent_m,duration_min," +
  "closures(from_date,to_date,partial,reason_en,reason_sk,source)";
```

In `js/hikes.js`, add the import and extend `prepareHike`:
```js
import { computeStatus } from "./status.js";
import { lineDistanceMeters } from "./stats.js";
```
Replace the `return { … }` in `prepareHike` with:
```js
  const distance_m = row.distance_m != null
    ? row.distance_m
    : (row.geometry && Array.isArray(row.geometry.coordinates)
        ? Math.round(lineDistanceMeters(row.geometry.coordinates))
        : null);
  return {
    slug: row.slug,
    name: { en: row.name_en, sk: row.name_sk },
    note,
    ref: row.ref || null,
    geometry: row.geometry,
    status,
    activeClosures,
    distance_m,
    ascent_m: row.ascent_m ?? null,
    duration_min: row.duration_min ?? null,
  };
```

- [ ] **Step 4: Run — `node --test` → all green** (paste the pass count).

- [ ] **Step 5: Commit**

```bash
git add js/data.js js/hikes.js tests/hikes.test.js tests/data.test.js
git commit -m "feat(stats): fetch + map stat fields with geometry distance fallback"
```

---

## Task 7: `js/route-layer.js` + refactor `trails.js` to use it (glue)

**Files:**
- Create: `js/route-layer.js`
- Modify: `js/trails.js`

No unit test (Leaflet/DOM glue). Verified by `node --check` + the suite staying green + a manual public-map check.

- [ ] **Step 1: Create `js/route-layer.js`:**

```js
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
```

- [ ] **Step 2: Refactor `js/trails.js` `drawRoute` to use it.**

Add the import near the other imports at the top:
```js
import { routeLayer } from "./route-layer.js";
```
Replace the body of `drawRoute` with:
```js
function drawRoute(hike) {
  if (ROUTE_LAYER) { MAP.removeLayer(ROUTE_LAYER); ROUTE_LAYER = null; }
  ROUTE_LAYER = routeLayer(hike.geometry, hike.status).addTo(MAP);
  const bounds = ROUTE_LAYER.getBounds();
  if (bounds.isValid()) MAP.fitBounds(bounds, { padding: [40, 40] });
}
```

- [ ] **Step 3: Verify** — `node --check js/route-layer.js`, `node --check js/trails.js`, then `node --test` (still green). **Manual:** serve the site, click a hike — the route still draws as the casing + dashed line.

- [ ] **Step 4: Commit**

```bash
git add js/route-layer.js js/trails.js
git commit -m "refactor(ui): extract shared routeLayer for public + admin maps"
```

---

## Task 8: i18n labels, units chip, remove coming-soon (glue)

**Files:**
- Modify: `js/i18n.js`, `index.html`, `js/ui.js`

- [ ] **Step 1: `js/i18n.js`** — add three keys to `DICT` (after `"detail.note"`):
```js
  "detail.distance": { en: "Distance", sk: "Dĺžka" },
  "detail.ascent": { en: "Elevation gain", sk: "Prevýšenie" },
  "detail.walkingTime": { en: "Walking time", sk: "Čas" },
```
and **delete** the now-unused lines:
```js
  "panel.planRoute": { en: "Plan a route", sk: "Naplánovať trasu" },
  "panel.comingSoon": { en: "Coming soon", sk: "Už čoskoro" },
```

- [ ] **Step 2: `index.html`** — delete the placeholder `.panel-section`:
```html
    <button class="panel-section" type="button">
      <span data-i18n="panel.planRoute">Plan a route</span>
      <small data-i18n="panel.comingSoon">Coming soon</small>
    </button>
```
and add the units chip inside `.controls`, before the `theme-toggle` button:
```html
      <button id="units-toggle" class="chip" type="button" aria-label="Toggle units">km</button>
```

- [ ] **Step 3: `js/ui.js`** — wire the units glue. Add the import and key:
```js
import { resolveUnits, nextUnits } from "./units.js";
const UNITS_KEY = "tt-units";
```
Add `initUnits();` to `initUi()`:
```js
export function initUi() {
  initTheme();
  initLang();
  initUnits();
}
```
Append the units section (mirrors `initLang`):
```js
/* ---- units ---- */
function readStoredUnits() {
  try { return localStorage.getItem(UNITS_KEY); } catch { return null; }
}
function applyUnits(units) {
  document.documentElement.setAttribute("data-units", units);
  const btn = document.getElementById("units-toggle");
  if (btn) btn.textContent = units === "imperial" ? "mi" : "km";
}
function emitUnitChange(units) {
  document.dispatchEvent(new CustomEvent("tt:unitchange", { detail: units }));
}
function initUnits() {
  let units = resolveUnits(readStoredUnits());
  applyUnits(units);
  const btn = document.getElementById("units-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      units = nextUnits(units);
      applyUnits(units);
      try { localStorage.setItem(UNITS_KEY, units); } catch { /* ignore */ }
      emitUnitChange(units);
    });
  }
}
```

- [ ] **Step 4: Verify** — `node --test` (still green; if any test referenced the removed `panel.*` keys, delete that reference). `node --check js/ui.js`. **Manual:** load the site — the "Plan a route" box is gone; the `km`/`mi` chip toggles and persists across reload.

- [ ] **Step 5: Commit**

```bash
git add js/i18n.js index.html js/ui.js
git commit -m "feat(stats): units toggle chip + stat labels; remove coming-soon placeholder"
```

---

## Task 9: Public display of stats in `js/trails.js` (glue)

**Files:**
- Modify: `js/trails.js`

- [ ] **Step 1: Add imports + a `units()` + `statParts()` helper** near the top of `js/trails.js`:
```js
import { formatDistance, formatAscent, formatDuration } from "./stats-format.js";
```
Add after the existing `lang()` helper:
```js
function units() {
  return document.documentElement.getAttribute("data-units") === "imperial" ? "imperial" : "metric";
}

// Compact list of the available stat strings, e.g. ["12.3 km", "↑540 m", "3 h 30 min"].
function statParts(hike) {
  const u = units();
  return [formatDistance(hike.distance_m, u), formatAscent(hike.ascent_m, u), formatDuration(hike.duration_min)]
    .filter(Boolean);
}
```

- [ ] **Step 2: List row** — in `renderList`, replace the row-building loop body so each row is a name+badge line plus a stats line:
```js
  for (const hike of HIKES) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "hike-row";

    const top = document.createElement("span");
    top.className = "hike-row-top";
    const name = document.createElement("span");
    name.textContent = hike.name[lang()] || hike.name.en;
    const badge = document.createElement("span");
    badge.className = `status-badge ${hike.status}`;
    badge.textContent = t(DICT, `status.${hike.status}`, lang());
    top.append(name, badge);
    row.appendChild(top);

    const parts = statParts(hike);
    if (parts.length) {
      const stats = document.createElement("span");
      stats.className = "hike-row-stats";
      stats.textContent = parts.join(" · ");
      row.appendChild(stats);
    }

    row.addEventListener("click", () => select(hike.slug));
    list.appendChild(row);
  }
```

- [ ] **Step 3: Detail panel** — in `openDetail`, immediately after `panel.append(back, title, badge);` insert a labeled stats block:
```js
  const su = units();
  const statItems = [
    [t(DICT, "detail.distance", L_), formatDistance(hike.distance_m, su)],
    [t(DICT, "detail.ascent", L_), formatAscent(hike.ascent_m, su)],
    [t(DICT, "detail.walkingTime", L_), formatDuration(hike.duration_min)],
  ].filter(([, v]) => v);
  if (statItems.length) {
    const stats = document.createElement("div");
    stats.className = "detail-stats";
    for (const [label, value] of statItems) {
      const item = document.createElement("span");
      item.className = "detail-stat";
      const l = document.createElement("strong");
      l.textContent = `${label} `;
      item.append(l, document.createTextNode(value));
      stats.appendChild(item);
    }
    panel.appendChild(stats);
  }
```

- [ ] **Step 4: Re-render on unit change** — in `initTrails`, next to the existing `tt:langchange` listener, add:
```js
  document.addEventListener("tt:unitchange", () => {
    renderList();
    if (SELECTED) openDetail(SELECTED);
  });
```

- [ ] **Step 5: Verify** — `node --check js/trails.js`, `node --test` (green). **Manual:** the list rows show `12.3 km · ↑540 m · 3 h 30 min` (only the present stats); the detail shows labeled stats; toggling `km`/`mi` re-renders both with converted distance/elevation and unchanged walking time; hikes with no stats show no stat line.

- [ ] **Step 6: Commit**

```bash
git add js/trails.js
git commit -m "feat(stats): show distance/elevation/walking-time in list + detail"
```

---

## Task 10: Admin shell — `admin.html` + CSS

**Files:**
- Modify: `admin.html`, `css/styles.css`

- [ ] **Step 1: `admin.html`** — load Leaflet. In `<head>`, after the `styles.css` link, add:
```html
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
```
Before the closing `</body>` (above the `js/admin/ui.js` module script), add:
```html
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
          integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
```

- [ ] **Step 2: `admin.html`** — add the map at the top of the editor pane. Immediately after `<section id="editor-pane" class="admin-editor" hidden>` insert:
```html
      <div id="admin-map" class="admin-map"></div>
```

- [ ] **Step 3: `admin.html`** — add the stat fields. After the `<div class="admin-geom">…</div>` block (the GPX upload), inside the `<form id="hike-form">`, add:
```html
        <div class="admin-stats">
          <label>Distance (km) <input id="f-distance" type="number" min="0" step="0.1" /></label>
          <label>Elevation gain (m) <input id="f-ascent" type="number" min="0" step="1" /></label>
          <label>Walking time
            <span class="admin-hm">
              <input id="f-dur-h" type="number" min="0" step="1" /> h
              <input id="f-dur-min" type="number" min="0" max="59" step="1" /> min
            </span>
          </label>
          <span id="f-stats-hint" class="admin-msg"></span>
        </div>
```

- [ ] **Step 4: `css/styles.css`** — append to the admin block:
```css
.admin-map { height: 280px; border: 1px solid var(--chrome-border); border-radius: var(--radius); margin-bottom: 12px; }
.admin-stats { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.admin-hm { display: inline-flex; align-items: center; gap: 4px; }
.admin-hm input { width: 56px; }
```
and update the **public** list-row rules (find the existing `.hike-row { … }` block) — replace it with:
```css
.hike-row {
  display: flex; flex-direction: column; gap: 2px;
  padding: 9px 12px; border: 0; background: transparent; cursor: pointer;
  font: inherit; color: var(--text); text-align: left; width: 100%;
  border-bottom: 1px solid var(--chrome-border);
}
.hike-row-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.hike-row-stats { font-size: 12px; color: var(--muted); }
.detail-stats { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 13px; }
.detail-stat strong { color: var(--muted); font-weight: 600; }
```
(Keep the existing `.hike-row:last-child`, `.hike-row:hover`, and `.status-badge` rules as they are.)

- [ ] **Step 5: Verify** — serve the site; `admin.html` loads with no console errors; the editor pane (once a hike is selected in the next tasks) will host the map. Public list rows still render. `node --test` unaffected.

- [ ] **Step 6: Commit**

```bash
git add admin.html css/styles.css
git commit -m "feat(stats): admin map container + stat fields; list/detail stat styles"
```

---

## Task 11: Admin validation + store SELECT

**Files:**
- Modify: `js/admin/validate.js`, `js/admin/store.js`
- Test: `tests/validate.test.js` (extend)

- [ ] **Step 1: Add the failing test** — append to `tests/validate.test.js`:
```js
test("validateHike: stats are optional, reject negatives", () => {
  const base = { slug: "x", name_en: "A", name_sk: "B", geometry: goodGeom };
  assert.deepEqual(validateHike({ ...base, distance_m: 12300, ascent_m: 540, duration_min: 210 }), []);
  assert.deepEqual(validateHike(base), []); // all absent is fine
  assert.ok(validateHike({ ...base, distance_m: -5 }).some((e) => /Distance/.test(e)));
  assert.ok(validateHike({ ...base, ascent_m: -1 }).some((e) => /Elevation gain/.test(e)));
});
```

- [ ] **Step 2: Run — `node --test tests/validate.test.js` → FAIL** (negatives currently pass).

- [ ] **Step 3: Implement** — in `js/admin/validate.js` `validateHike`, before `return errs;`, add:
```js
  for (const [key, label] of [["distance_m", "Distance"], ["ascent_m", "Elevation gain"], ["duration_min", "Walking time"]]) {
    const v = h[key];
    if (v != null && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
      errs.push(`${label} must be a non-negative number.`);
    }
  }
```

- [ ] **Step 4: Run — `node --test tests/validate.test.js` → PASS.**

- [ ] **Step 5: `js/admin/store.js`** — add the columns to `listHikes`'s select (the embedded `closures(...)` stays):
```js
    .select(
      "id,slug,name_en,name_sk,geometry,seasonal_from,seasonal_to,seasonal_partial,note_en,note_sk,ref," +
        "distance_m,ascent_m,duration_min," +
        "closures(id,from_date,to_date,partial,reason_en,reason_sk,source)"
    )
```

- [ ] **Step 6: Commit**

```bash
git add js/admin/validate.js js/admin/store.js tests/validate.test.js
git commit -m "feat(stats): validate stat fields; fetch them in admin store"
```

---

## Task 12: Admin glue — map preview, GPX pre-fill, load/save (`js/admin/ui.js`)

**Files:**
- Modify: `js/admin/ui.js`

No unit test (supabase-js + Leaflet + DOM glue). Verified via `node --check` + the full manual cycle.

- [ ] **Step 1: Add imports** at the top of `js/admin/ui.js`:
```js
import { initMap } from "../map.js";
import { routeLayer } from "../route-layer.js";
import { gpxStats } from "./gpx.js";
import { estimateDurationMin } from "../stats.js";
```
and module-level state near `let HIKES`:
```js
let ADMIN_MAP = null;
let ADMIN_ROUTE = null;
```

- [ ] **Step 2: Map helpers** — add these functions:
```js
function ensureMap() {
  if (!ADMIN_MAP) ADMIN_MAP = initMap("admin-map");
  ADMIN_MAP.invalidateSize(); // the editor pane was hidden until now
}

// Current Open/Closed/Partial from the live form (same inputs the badge uses), for route colour.
function currentStatus() {
  const from = $("f-seasonal-from").value.trim();
  const to = $("f-seasonal-to").value.trim();
  const seasonal = from && to ? { from, to, partial: $("f-seasonal-partial").checked } : null;
  const adhoc = state.closures.filter((c) => !c._deleted)
    .map((c) => ({ from_date: c.from_date || null, to_date: c.to_date || null, partial: !!c.partial }));
  return computeStatus(seasonal, adhoc, today()).status;
}

function drawAdminRoute(geometry) {
  if (ADMIN_ROUTE) { ADMIN_MAP.removeLayer(ADMIN_ROUTE); ADMIN_ROUTE = null; }
  if (!geometry || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return;
  ADMIN_ROUTE = routeLayer(geometry, currentStatus()).addTo(ADMIN_MAP);
  const b = ADMIN_ROUTE.getBounds();
  if (b.isValid()) ADMIN_MAP.fitBounds(b, { padding: [30, 30] });
}
```
> `computeStatus` and `$` and `today` already exist in this module (used by `updateBadge`). `updateBadge` can be simplified to reuse `currentStatus()`, but that's optional.

- [ ] **Step 3: Stat field helpers** — add:
```js
// minutes → fill the h/min inputs; null → blank.
function setDurationFields(min) {
  if (min == null) { $("f-dur-h").value = ""; $("f-dur-min").value = ""; return; }
  $("f-dur-h").value = Math.floor(min / 60);
  $("f-dur-min").value = Math.round(min % 60);
}
function durationFromFields() {
  const h = parseInt($("f-dur-h").value, 10);
  const m = parseInt($("f-dur-min").value, 10);
  if (!Number.isFinite(h) && !Number.isFinite(m)) return null;
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
function numOrNull(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
```

- [ ] **Step 4: Populate fields in `loadEditor`** — at the end of `loadEditor`, before/after `renderClosures(); updateBadge();`, add:
```js
  $("f-distance").value = h.distance_m != null ? (h.distance_m / 1000).toFixed(1) : "";
  $("f-ascent").value = h.ascent_m != null ? h.ascent_m : "";
  setDurationFields(h.duration_min ?? null);
  $("f-stats-hint").textContent = "";
  ensureMap();
  drawAdminRoute(h.geometry);
```
and add the three fields to the objects built by `blankHike()` and `editHike()` (so `loadEditor` receives them):
```js
// in blankHike(): add to the returned object
    distance_m: null, ascent_m: null, duration_min: null,
// in editHike()'s loadEditor({...}) call: add
    distance_m: row.distance_m ?? null, ascent_m: row.ascent_m ?? null, duration_min: row.duration_min ?? null,
```

- [ ] **Step 5: GPX pre-fill** — replace `onGpxChange` with:
```js
async function onGpxChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    state.geometry = gpxToLineString(text);
    const { distanceM, ascentM } = gpxStats(text);
    $("f-distance").value = (distanceM / 1000).toFixed(1);
    $("f-ascent").value = ascentM != null ? ascentM : "";
    setDurationFields(estimateDurationMin(distanceM, ascentM));
    $("f-geom-status").textContent = `✓ ${state.geometry.coordinates.length} points`;
    $("f-stats-hint").textContent = "auto-filled from GPX — edit if needed";
    drawAdminRoute(state.geometry);
  } catch (err) {
    $("f-geom-status").textContent = `GPX error: ${err.message}`; // geometry + fields unchanged
  }
}
```

- [ ] **Step 6: Save the fields** — in `formToHike`, add to the returned object (after `geometry: state.geometry,` and before the `updated_at` line):
```js
    distance_m: numOrNull($("f-distance").value) != null ? Math.round(numOrNull($("f-distance").value) * 1000) : null,
    ascent_m: numOrNull($("f-ascent").value) != null ? Math.round(numOrNull($("f-ascent").value)) : null,
    duration_min: durationFromFields(),
```

- [ ] **Step 7: Verify** — `node --check js/admin/ui.js`; `node --test` (still green). **Manual full cycle** (signed in): select an existing hike → its route shows on the admin map; upload a GPX → the route preview redraws and Distance/Elevation/Walking-time auto-fill (elevation blank if the GPX has none) with the "auto-filled" hint; edit a value; Save; reload → values persist; open the public site → the hike's detail + list row show the stats; toggle units → they convert.

- [ ] **Step 8: Commit**

```bash
git add js/admin/ui.js
git commit -m "feat(stats): admin map preview + GPX-prefilled, overridable stat fields"
```

---

## Self-Review notes (for the implementer)

- **Type/shape consistency:** stat columns `distance_m`/`ascent_m`/`duration_min` (integer meters/meters/minutes) are identical across `db`, `data.js` SELECT, `hikes.js`, `store.js`, `validate.js`, and `admin/ui.js#formToHike`. `gpxStats` returns `{ distanceM, ascentM }` (ascent nullable). `estimateDurationMin(distanceM, ascentM)` and `lineDistanceMeters(coords)` signatures match every call site. `routeLayer(geometry, status)` is used identically by `trails.js` and `admin/ui.js`. The units value is the string `"metric"`/`"imperial"` everywhere; `trails.js#units()` reads `data-units`, which `ui.js#applyUnits` sets.
- **Spec coverage:** §3 columns → Task 1; §4 GPX stats + Naismith + fallback → Tasks 2,5,6; §5 admin fields + map preview + validation → Tasks 10,11,12; §6 public display + formats + units toggle + i18n → Tasks 3,4,8,9; §7 module structure → all tasks; §8 error handling → GPX error path (Task 12), missing-stat omission (Task 9), unit fallback (Tasks 4,9); §9 testing → Tasks 2,3,4,5,6,11 unit + Tasks 7,8,9,10,12 manual; the coming-soon removal → Task 8.
- **No public schema/RLS change** beyond the additive columns; admin stays metric on input; walking time is units-independent.
- **Watch:** `js/admin/gpx.js` imports `../stats.js` (relative to `js/admin/`); `node --test` only loads `tests/*.test.js`, which import the pure modules — it never imports `map.js`/`route-layer.js`/`ui.js` (which need the Leaflet/global `L` and `config.js`), so those stay out of the test run.
