# Waymarked Routes + List Polish (Increment F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-segment KST waymark rendering (color + solid/dashed) on the route line, red ✕ closure markers placed on the actually-closed stretch, click-to-split/extent admin editing with marking-mode dimming, waymark swatches in list+detail, and an expanded-group tint in the list.

**Architecture:** Anchor coordinates stored in JSONB (`hikes.waymark_segments`, `hikes.seasonal_extent_from/to`, `closures.extent_from/to`) are snapped to the route at render time by a new pure module `js/waymarks.js`; the shared `js/route-layer.js` renders one casing + N waymark-styled polylines + ✕ markers and loses its `status` parameter. Admin edits happen as click-modes on the existing map preview with live re-render.

**Tech Stack:** Vanilla ES modules, Leaflet (global `L`), Supabase PostgREST + supabase-js (admin), `node --test`. Spec: `docs/superpowers/specs/2026-06-12-waymarks-list-polish-design.md`.

---

## Repo gotchas (read first)

- All commands run from the repo root `C:\Users\Dano\Downloads\claude\tatra-trails` (Windows).
- **`git add` ONLY the exact files named in each task.** `db/admin-rls.sql` and `db/friends-access.sql` have intentional uncommitted local diffs — NEVER stage them. No `git add -A` / `git add .`.
- **Pushing `master` deploys to GitHub Pages.** Commit per task; do NOT push — the final push is user-gated (Task 10). **Deploy ordering:** the user must run `db/add-waymarks.sql` in the Supabase SQL Editor BEFORE the push — the new code's PostgREST SELECT names the new columns and errors if they don't exist. The migration is additive and harmless to the currently-deployed code.
- Manual browser checks: `python -m http.server 8000`, open `http://localhost:8000`, **hard-refresh (Ctrl+Shift+R)** after every JS change (ES-module caching causes misleading export errors).
- Existing modules you will touch were shipped in Increment E — re-read them before editing; do not regress the E flags.

## File structure

| File | Action | Responsibility |
|---|---|---|
| `css/styles.css` | Modify | Expanded-group tint (Task 1); `trail-wm--*` colors, `.closure-x`, swatches, armed-mode cursor (later tasks) |
| `js/waymarks.js` | Create | PURE: snapping, segment slicing, closure stretches, marker spacing, swatch dedup |
| `tests/waymarks.test.js` | Create | Unit tests for all of the above |
| `db/add-waymarks.sql` | Create | Additive migration (5 columns; user runs it) |
| `js/status.js` + `tests/status.test.js` | Modify | Seasonal activeClosure carries extent anchors |
| `js/hikes.js` + `tests/hikes.test.js` | Modify | Prepared hike carries `waymark_segments`; seasonal object carries extents |
| `js/data.js` + `tests/data.test.js` | Modify | SELECT gains the new columns |
| `js/route-layer.js` | Modify | New signature; waymark polylines; ✕ markers; `dim` |
| `js/trails.js` | Modify | New routeLayer opts; list swatches; detail Waymarks row |
| `js/i18n.js` | Modify | 8 new keys |
| `js/admin/store.js` | Modify | listHikes SELECT gains new columns |
| `js/admin/ui.js` + `admin.html` | Modify | Waymarks editor block, split/extent click-modes, dimming, save payload |

---

### Task 1: Expanded-group tint (independent CSS polish)

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: Add the tint rules**

In `css/styles.css`, directly after the existing block that ends with `.region-group .hike-row { padding-left: 26px; }` (~line 250), add:

```css
/* --- Increment F: an OPEN group must look open (soft tint + left accent bar). The
   transparent border exists in the closed state too so opening causes no layout shift. */
.region-group { border-left: 3px solid transparent; }
.region-group[open] {
  border-left-color: var(--accent);
  background: rgba(46, 125, 50, .06);
}
.region-group .hike-group[open] { background: rgba(46, 125, 50, .08); }
html.dark .region-group[open] { background: rgba(144, 200, 160, .09); }
html.dark .region-group .hike-group[open] { background: rgba(144, 200, 160, .12); }
```

- [ ] **Step 2: Visual sanity check**

Run: `python -m http.server 8000`, open `http://localhost:8000`, expand a region and a band inside it, check both themes (tint visible, no horizontal jump when opening). Stop the server.

- [ ] **Step 3: Commit**

```bash
git add css/styles.css
git commit -m "style(list): tint + accent bar on expanded groups (F)"
```

---

### Task 2: `js/waymarks.js` — `nearestPointIndex` + `segmentPolylines` (TDD)

**Files:**
- Create: `js/waymarks.js`
- Create: `tests/waymarks.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/waymarks.test.js`:

```js
// tests/waymarks.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { nearestPointIndex, segmentPolylines } from "../js/waymarks.js";

// A simple 5-vertex west→east line along latitude 49: indices 0..4 at lon 20.00..20.04.
const COORDS = [[20.00, 49], [20.01, 49], [20.02, 49], [20.03, 49], [20.04, 49]];
const GEOM = { type: "LineString", coordinates: COORDS };

test("nearestPointIndex: picks the closest vertex", () => {
  assert.equal(nearestPointIndex(COORDS, [20.0, 49]), 0);
  assert.equal(nearestPointIndex(COORDS, [20.021, 49.0001]), 2);
  assert.equal(nearestPointIndex(COORDS, [25, 50]), 4); // far away → nearest end
});

test("segmentPolylines: no segment data → one dashed none fallback over the whole line", () => {
  for (const segs of [null, undefined, [], "garbage"]) {
    const out = segmentPolylines(GEOM, segs);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0], { color: "none", style: "dashed", coords: COORDS });
  }
});

test("segmentPolylines: invalid geometry → empty array", () => {
  assert.deepEqual(segmentPolylines(null, [{ color: "red", style: "solid" }]), []);
  assert.deepEqual(segmentPolylines({ type: "LineString", coordinates: [[20, 49]] }, null), []);
});

test("segmentPolylines: splits share the boundary vertex", () => {
  const segs = [{ color: "blue", style: "solid", until: [20.02, 49] }, { color: "red", style: "solid" }];
  const out = segmentPolylines(GEOM, segs);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].coords, COORDS.slice(0, 3)); // 0,1,2
  assert.deepEqual(out[1].coords, COORDS.slice(2));    // 2,3,4 — vertex 2 shared
  assert.equal(out[0].color, "blue");
  assert.equal(out[1].color, "red");
});

test("segmentPolylines: anchors snapping out of order are re-sorted", () => {
  const segs = [
    { color: "blue", style: "solid", until: [20.03, 49] },  // snaps to 3
    { color: "red", style: "solid", until: [20.01, 49] },   // snaps to 1 — out of order
    { color: "green", style: "solid" },
  ];
  const out = segmentPolylines(GEOM, segs);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((s) => s.coords.length), [2, 3, 2]); // 0-1, 1-3, 3-4
});

test("segmentPolylines: zero-length slices are dropped", () => {
  const segs = [
    { color: "blue", style: "solid", until: [20.02, 49] },
    { color: "red", style: "solid", until: [20.0201, 49] }, // snaps to the same vertex 2
    { color: "green", style: "solid" },
  ];
  const out = segmentPolylines(GEOM, segs);
  assert.equal(out.length, 2); // the red zero-length slice is gone
  assert.deepEqual(out.map((s) => s.color), ["blue", "green"]);
});

test("segmentPolylines: normalization — unknown color→none, unknown style→solid, none forces dashed", () => {
  const out = segmentPolylines(GEOM, [{ color: "purple", style: "wavy" }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].color, "none");
  assert.equal(out[0].style, "dashed"); // none is ALWAYS dashed (overrides solid)
  const solidRed = segmentPolylines(GEOM, [{ color: "red", style: "wavy" }]);
  assert.equal(solidRed[0].style, "solid");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/waymarks.test.js`
Expected: FAIL — `Cannot find module ... js/waymarks.js`

- [ ] **Step 3: Implement**

Create `js/waymarks.js`:

```js
// js/waymarks.js
// PURE waymark/closure geometry math — no DOM/Leaflet deps, unit-testable.
// Coordinates are GeoJSON [lon, lat]. Anchors are stored coordinates clicked in the admin;
// they are snapped to the nearest route vertex at render time so GPX re-uploads can't
// orphan them (the route changes, anchors just re-snap).
import { haversineMeters } from "./stats.js";

export const WAYMARK_COLORS = ["red", "blue", "green", "yellow", "none"];

// Index of the route vertex nearest to [lon, lat]. Routes are decimated to ≤ ~500 points,
// so a linear scan is plenty.
export function nearestPointIndex(coords, point) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineMeters(coords[i], point);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function validGeometry(geometry) {
  return geometry && geometry.type === "LineString" && Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2 && Array.isArray(geometry.coordinates[0]);
}

// "none" is ALWAYS dashed (unmarked paths render like the base map draws them).
function normalizeSeg(seg) {
  const color = WAYMARK_COLORS.includes(seg && seg.color) ? seg.color : "none";
  const style = color === "none" ? "dashed" : (seg && seg.style === "dashed" ? "dashed" : "solid");
  return { color, style };
}

// geometry + stored waymark_segments -> [{ color, style, coords }] ready to draw.
// Adjacent slices share the boundary vertex so the polylines join seamlessly.
export function segmentPolylines(geometry, waymarkSegments) {
  if (!validGeometry(geometry)) return [];
  const coords = geometry.coordinates;
  const all = { color: "none", style: "dashed", coords };
  if (!Array.isArray(waymarkSegments) || waymarkSegments.length === 0) return [all];

  // Snap each segment's end anchor; the last segment (no `until`) runs to the route end.
  const cuts = waymarkSegments.map((seg) => ({
    ...normalizeSeg(seg),
    end: seg && Array.isArray(seg.until) ? nearestPointIndex(coords, seg.until) : coords.length - 1,
  }));
  cuts.sort((a, b) => a.end - b.end); // out-of-order anchors are re-sorted, never an error

  const out = [];
  let from = 0;
  for (const cut of cuts) {
    const end = Math.max(cut.end, from);
    if (end > from || (from === 0 && end === coords.length - 1)) {
      if (end > from) out.push({ color: cut.color, style: cut.style, coords: coords.slice(from, end + 1) });
    }
    from = end; // shared boundary vertex: next slice starts where this one ended
  }
  if (from < coords.length - 1) {
    // Trailing stretch not covered by any segment (e.g. last `until` snapped early) — fallback.
    const last = cuts[cuts.length - 1];
    out.push({ color: last.color, style: last.style, coords: coords.slice(from) });
  }
  return out.length ? out : [all];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/waymarks.test.js`
Expected: PASS (7 tests). If the out-of-order or trailing-stretch tests fail, check the `from = end` sharing logic before touching the tests.

- [ ] **Step 5: Commit**

```bash
git add js/waymarks.js tests/waymarks.test.js
git commit -m "feat(map): pure waymark segment slicing with render-time snapping (F)"
```

---

### Task 3: `js/waymarks.js` — `closureStretch` + `closureMarkerPositions` (TDD)

**Files:**
- Modify: `js/waymarks.js` (append)
- Modify: `tests/waymarks.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/waymarks.test.js` (extend the import line to include `closureStretch, closureMarkerPositions`):

```js
test("closureStretch: slices between anchors, reversed clicks normalized", () => {
  const fwd = closureStretch(GEOM, [20.01, 49], [20.03, 49]);
  assert.deepEqual(fwd, COORDS.slice(1, 4));
  const rev = closureStretch(GEOM, [20.03, 49], [20.01, 49]);
  assert.deepEqual(rev, COORDS.slice(1, 4)); // same stretch, regardless of click order
});

test("closureStretch: null on invalid input or same-vertex anchors", () => {
  assert.equal(closureStretch(null, [20.01, 49], [20.03, 49]), null);
  assert.equal(closureStretch(GEOM, null, [20.03, 49]), null);
  assert.equal(closureStretch(GEOM, [20.02, 49], [20.0201, 49]), null); // both snap to vertex 2
});

test("closureMarkerPositions: at least one marker (midpoint) for a short stretch", () => {
  const stretch = COORDS.slice(1, 3); // ~730 m at this latitude — exceeds nothing fancy
  const out = closureMarkerPositions(COORDS.slice(0, 2), { spacingM: 5000 });
  assert.equal(out.length, 1); // spacing larger than the stretch → midpoint only
});

test("closureMarkerPositions: spacing produces multiple markers, capped at 15", () => {
  // COORDS spans ~2.9 km; 400 m spacing → ~7 markers
  const out = closureMarkerPositions(COORDS, { spacingM: 400 });
  assert.ok(out.length >= 5 && out.length <= 9, `got ${out.length}`);
  for (const p of out) assert.ok(Array.isArray(p) && p.length === 2);
  const capped = closureMarkerPositions(COORDS, { spacingM: 1 });
  assert.equal(capped.length, 15); // hard cap
});

test("closureMarkerPositions: empty/short input → empty array", () => {
  assert.deepEqual(closureMarkerPositions(null), []);
  assert.deepEqual(closureMarkerPositions([[20, 49]]), []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/waymarks.test.js`
Expected: FAIL — missing exports.

- [ ] **Step 3: Implement** — append to `js/waymarks.js`:

```js
// The closed stretch between two stored anchors, normalized so click order doesn't matter.
// Returns [lon,lat][] or null (invalid input / both anchors on the same vertex).
export function closureStretch(geometry, from, to) {
  if (!validGeometry(geometry) || !Array.isArray(from) || !Array.isArray(to)) return null;
  const coords = geometry.coordinates;
  let a = nearestPointIndex(coords, from);
  let b = nearestPointIndex(coords, to);
  if (a > b) [a, b] = [b, a];
  if (a === b) return null;
  return coords.slice(a, b + 1);
}

// Marker positions along a stretch: one per ~spacingM meters, ≥1 (the midpoint), ≤15
// (a 30 km seasonal closure must not carpet the map). Walks cumulative distance and
// emits the vertex that crosses each next multiple of spacingM.
export function closureMarkerPositions(stretchCoords, { spacingM = 400 } = {}) {
  if (!Array.isArray(stretchCoords) || stretchCoords.length < 2) return [];
  const out = [];
  let walked = 0;
  let next = spacingM;
  for (let i = 1; i < stretchCoords.length && out.length < 15; i++) {
    walked += haversineMeters(stretchCoords[i - 1], stretchCoords[i]);
    while (walked >= next && out.length < 15) {
      out.push(stretchCoords[i]);
      next += spacingM;
    }
  }
  if (out.length === 0) out.push(stretchCoords[Math.floor(stretchCoords.length / 2)]);
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/waymarks.test.js`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add js/waymarks.js tests/waymarks.test.js
git commit -m "feat(map): pure closure stretch slicing + spaced marker positions (F)"
```

---

### Task 4: `js/waymarks.js` — `swatchList` (TDD)

**Files:**
- Modify: `js/waymarks.js` (append)
- Modify: `tests/waymarks.test.js` (append; extend import with `swatchList`)

- [ ] **Step 1: Write the failing tests**

```js
test("swatchList: dedupes repeats but keeps route order of distinct pairs", () => {
  const segs = [
    { color: "green", style: "solid", until: [20.01, 49] },
    { color: "green", style: "dashed", until: [20.02, 49] },
    { color: "green", style: "solid", until: [20.03, 49] },
    { color: "none", style: "solid" }, // normalizes to none+dashed
  ];
  assert.deepEqual(swatchList(segs), [
    { color: "green", style: "solid" },
    { color: "green", style: "dashed" },
    { color: "none", style: "dashed" },
  ]);
});

test("swatchList: empty/invalid input → empty array", () => {
  assert.deepEqual(swatchList(null), []);
  assert.deepEqual(swatchList([]), []);
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test tests/waymarks.test.js` — FAIL (missing export).

- [ ] **Step 3: Implement** — append to `js/waymarks.js`:

```js
// Deduplicated (color,style) pairs in route order, for the list/detail swatches.
// "green, dashed green, green again" → two entries, not three.
export function swatchList(waymarkSegments) {
  if (!Array.isArray(waymarkSegments)) return [];
  const seen = new Set();
  const out = [];
  for (const seg of waymarkSegments) {
    const n = normalizeSeg(seg);
    const key = `${n.color}/${n.style}`;
    if (!seen.has(key)) { seen.add(key); out.push(n); }
  }
  return out;
}
```

- [ ] **Step 4: Verify pass**

Run: `node --test tests/waymarks.test.js` — PASS (14 tests). Then `node --test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add js/waymarks.js tests/waymarks.test.js
git commit -m "feat(board): pure swatchList — deduped waymark swatches in route order (F)"
```

---

### Task 5: Migration + data plumbing (status.js, hikes.js, data.js, store.js)

**Files:**
- Create: `db/add-waymarks.sql`
- Modify: `js/status.js:33`, `tests/status.test.js` (append)
- Modify: `js/hikes.js`, `tests/hikes.test.js` (append)
- Modify: `js/data.js:4-8`, `tests/data.test.js` (only if it asserts the SELECT string — check first)
- Modify: `js/admin/store.js:9-13`

- [ ] **Step 1: Write the migration**

Create `db/add-waymarks.sql`:

```sql
-- Increment F: per-segment waymarks + closure extents. Additive and safe to run before
-- the matching frontend deploys. Run in the Supabase SQL Editor.
alter table hikes    add column if not exists waymark_segments    jsonb;
alter table hikes    add column if not exists seasonal_extent_from jsonb;
alter table hikes    add column if not exists seasonal_extent_to   jsonb;
alter table closures add column if not exists extent_from jsonb;
alter table closures add column if not exists extent_to   jsonb;
-- No RLS changes: existing hikes/closures policies cover the new columns.
```

- [ ] **Step 2: TDD — seasonal activeClosure carries extents**

Append to `tests/status.test.js`:

```js
test("computeStatus: seasonal activeClosure carries extent anchors (null when absent)", () => {
  const today = { mmdd: "01-15", iso: "2026-01-15" };
  const plain = computeStatus({ from: "11-01", to: "06-15" }, [], today);
  assert.equal(plain.activeClosures[0].extent_from, null);
  const seasonal = { from: "11-01", to: "06-15", partial: true,
    extent_from: [20.06, 49.12], extent_to: [20.09, 49.15] };
  const r = computeStatus(seasonal, [], today);
  assert.deepEqual(r.activeClosures[0].extent_from, [20.06, 49.12]);
  assert.deepEqual(r.activeClosures[0].extent_to, [20.09, 49.15]);
  assert.equal(r.status, "partial");
});
```

Run `node --test tests/status.test.js` — FAIL (extent_from undefined, not null).

In `js/status.js`, change line 33 from:

```js
    activeClosures.push({ kind: "seasonal", partial: !!seasonal.partial, from: seasonal.from, to: seasonal.to });
```

to:

```js
    activeClosures.push({ kind: "seasonal", partial: !!seasonal.partial, from: seasonal.from, to: seasonal.to,
      extent_from: seasonal.extent_from ?? null, extent_to: seasonal.extent_to ?? null });
```

Run again — PASS. (Ad-hoc closures need no change: `{ kind: "adhoc", ...c }` spreads the row's `extent_from/to` through automatically.)

- [ ] **Step 3: TDD — prepared hikes carry waymark data**

Append to `tests/hikes.test.js` (match its existing row-fixture style — read the file first):

```js
test("prepareHikes: carries waymark_segments and seasonal extents through", () => {
  const today = { mmdd: "01-15", iso: "2026-01-15" };
  const segs = [{ color: "red", style: "solid" }];
  const rows = [{
    slug: "x", name_en: "X", name_sk: "X",
    geometry: { type: "LineString", coordinates: [[20, 49], [20.01, 49]] },
    seasonal_from: "11-01", seasonal_to: "06-15", seasonal_partial: false,
    seasonal_extent_from: [20, 49], seasonal_extent_to: [20.01, 49],
    waymark_segments: segs, closures: [],
  }];
  const [h] = prepareHikes(rows, today);
  assert.deepEqual(h.waymark_segments, segs);
  assert.deepEqual(h.activeClosures[0].extent_from, [20, 49]); // via the seasonal object
});

test("prepareHikes: waymark_segments defaults to null", () => {
  const today = { mmdd: "07-15", iso: "2026-07-15" };
  const rows = [{ slug: "y", name_en: "Y", name_sk: "Y",
    geometry: { type: "LineString", coordinates: [[20, 49], [20.01, 49]] }, closures: [] }];
  assert.equal(prepareHikes(rows, today)[0].waymark_segments, null);
});
```

Run `node --test tests/hikes.test.js` — FAIL.

In `js/hikes.js` `prepareHike`, change the seasonal construction (lines 7-9) to:

```js
  const seasonal = row.seasonal_from && row.seasonal_to
    ? { from: row.seasonal_from, to: row.seasonal_to, partial: !!row.seasonal_partial,
        extent_from: row.seasonal_extent_from ?? null, extent_to: row.seasonal_extent_to ?? null }
    : null;
```

and add to the returned object (after `is_public`):

```js
    waymark_segments: row.waymark_segments ?? null,
```

Run again — PASS.

- [ ] **Step 4: Extend the SELECTs**

In `js/data.js` lines 4-8, change the `SELECT` constant to:

```js
const SELECT =
  "slug,name_en,name_sk,geometry,seasonal_from,seasonal_to,seasonal_partial,note_en,note_sk,ref," +
  "distance_m,ascent_m,duration_min,is_public,waymark_segments,seasonal_extent_from,seasonal_extent_to," +
  "closures(from_date,to_date,partial,reason_en,reason_sk,source,extent_from,extent_to)," +
  "hike_regions(region_id)";
```

Check `tests/data.test.js` — if it asserts the encoded SELECT string, update the expectation to match; if it only checks URL/headers/error behavior, no change.

In `js/admin/store.js` `listHikes()` (lines 9-13), change the select string to:

```js
      "id,slug,name_en,name_sk,geometry,seasonal_from,seasonal_to,seasonal_partial,note_en,note_sk,ref," +
        "distance_m,ascent_m,duration_min,is_public,waymark_segments,seasonal_extent_from,seasonal_extent_to," +
        "closures(id,from_date,to_date,partial,reason_en,reason_sk,source,extent_from,extent_to)," +
        "hike_regions(region_id)"
```

- [ ] **Step 5: Full suite + commit**

Run: `node --test` — all green (no count regression; new tests added).

```bash
git add db/add-waymarks.sql js/status.js tests/status.test.js js/hikes.js tests/hikes.test.js js/data.js tests/data.test.js js/admin/store.js
git commit -m "feat(db,data): waymark segments + closure/seasonal extent plumbing (F)"
```

(If `tests/data.test.js` needed no change, drop it from the `git add`.)

---

### Task 6: `js/route-layer.js` — waymark polylines, ✕ markers, dim (+ CSS)

Leaflet glue — no unit tests; full suite as regression; manual verify in Task 10.

**Files:**
- Modify: `js/route-layer.js`
- Modify: `css/styles.css`
- Modify: `js/trails.js` (call-site update so the app keeps working within this task)
- Modify: `js/admin/ui.js:310-316` (call-site compile fix only; full editor in Task 8)

- [ ] **Step 1: Rewrite the rendering part of `js/route-layer.js`**

Keep the entire flag section (FLAG_W/H, ANCHOR_X/Y, GREEN/SLATE, `flagSvg`, `flagMarker`, `DEFAULT_LABELS`) EXACTLY as it is (Increment E, review-fixed). Add the import at the top and replace ONLY the exported `routeLayer` function; also add the ✕ marker builder. The new file top and bottom:

```js
// js/route-layer.js — shared Leaflet route rendering (white/dark casing + per-segment
// waymark-styled lines + closure ✕ markers + start/finish flags), used by the public map
// (trails.js) and the admin map preview so routes look identical. Returns an UNATTACHED
// L.featureGroup; the caller adds it to a map, fits bounds, and removes it.
import { routeEndpoints } from "./route-endpoints.js";
import { segmentPolylines, closureStretch, closureMarkerPositions } from "./waymarks.js";
```

(…flag code unchanged…)

```js
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
```

- [ ] **Step 2: CSS — waymark strokes + ✕ marker**

In `css/styles.css`, REPLACE the three status stroke rules (`path.trail--open`, `path.trail--closed`, `path.trail--partial`, ~lines 162-164) with:

```css
/* Increment F: the line encodes the KST waymark (colour + dash), not the status —
   status lives in the badges and the ✕ closure markers. */
path.trail-wm--red    { stroke: #e53935; }
path.trail-wm--blue   { stroke: #1565c0; }
path.trail-wm--green  { stroke: #2e7d32; }
path.trail-wm--yellow { stroke: #f9a825; }
path.trail-wm--none   { stroke: #78909c; }
.closure-x { filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .45)); }
.closure-x svg { display: block; }
```

(`path.trail-casing` rules stay. Grep the repo for `trail--open|trail--closed|trail--partial` afterwards: the only remaining users must be the `.status-badge` rules, which use different class names — if anything else references the removed classes, fix it.)

- [ ] **Step 3: Update both call sites (minimal, app must keep working)**

`js/trails.js` `drawRoute` — replace the `routeLayer(...)` call:

```js
  ROUTE_LAYER = routeLayer(hike.geometry, {
    labels,
    segments: hike.waymark_segments,
    closures: closuresForMap(hike),
  }).addTo(MAP);
```

and add this helper directly above `drawRoute` (uses `fmtMMDD`/`fmtDate` already defined in the file — verify their names by reading the file):

```js
// Active closures annotated with a localized tooltip label for the ✕ markers.
function closuresForMap(hike) {
  const L_ = lang();
  return (hike.activeClosures || []).map((c) => {
    const range = c.kind === "seasonal"
      ? `${fmtMMDD(c.from)} – ${fmtMMDD(c.to)}`
      : (c.to_date ? `${fmtDate(c.from_date)} – ${fmtDate(c.to_date)}`
                   : `${fmtDate(c.from_date)} – ${t(DICT, "detail.ongoing", L_)}`);
    const reason = c.kind === "seasonal"
      ? t(DICT, "detail.seasonal", L_)
      : ((L_ === "sk" ? c.reason_sk : c.reason_en) || c.reason_en || "");
    return { ...c, label: reason ? `${reason} · ${range}` : range };
  });
}
```

`js/admin/ui.js` `drawAdminRoute` (line 313) — minimal compile fix for now (Task 8 rebuilds it properly):

```js
  ADMIN_ROUTE = routeLayer(geometry, { segments: state && state.waymark_segments }).addTo(ADMIN_MAP);
```

Also DELETE the now-unused `currentStatus()` function (lines 300-308) — its only caller was this line. (`updateBadge` has its own copy of that logic and is untouched.)

- [ ] **Step 4: Verify**

Run: `node --check js/route-layer.js; node --check js/trails.js; node --check js/admin/ui.js` — clean. `node --test` — full suite green.
Quick browser sanity (`python -m http.server 8000`, hard-refresh): select a hike → neutral dashed grey line (no waymark data yet) + E flags; no console errors.

- [ ] **Step 5: Commit**

```bash
git add js/route-layer.js css/styles.css js/trails.js js/admin/ui.js
git commit -m "feat(map): waymark-styled segments + closure x-markers in shared route layer (F)"
```

---

### Task 7: Public board — swatches in list + detail, i18n keys

**Files:**
- Modify: `js/i18n.js` (after the `marker.startEnd` line)
- Modify: `js/trails.js` (`renderRow`, `openDetail`, imports)
- Modify: `css/styles.css` (swatch styles)

- [ ] **Step 1: i18n keys** — in `js/i18n.js` after `"marker.startEnd"`, insert:

```js
  "waymark.red": { en: "red", sk: "červená" },
  "waymark.blue": { en: "blue", sk: "modrá" },
  "waymark.green": { en: "green", sk: "zelená" },
  "waymark.yellow": { en: "yellow", sk: "žltá" },
  "waymark.none": { en: "unmarked", sk: "neznačené" },
  "waymark.dashed": { en: "dashed", sk: "prerušovaná" },
  "detail.waymarks": { en: "Waymarks", sk: "Značenie" },
```

Run: `node --test tests/i18n.test.js` — the completeness test stays green.

- [ ] **Step 2: Swatch builder + list rows** — in `js/trails.js`:

Add to imports: `import { swatchList } from "./waymarks.js";`

Add this helper near `statParts` (read the file to place it sensibly):

```js
// A strip of small line swatches (solid/dashed, waymark-coloured). Returns null when the
// hike has no waymark data — callers append nothing.
function swatchStrip(hike, large = false) {
  const swatches = swatchList(hike.waymark_segments);
  if (!swatches.length) return null;
  const strip = document.createElement("span");
  strip.className = "wm-strip";
  for (const s of swatches) {
    const el = document.createElement("span");
    el.className = `wm-swatch wm-swatch--${s.color}${s.style === "dashed" ? " wm-swatch--dashed" : ""}${large ? " wm-swatch--lg" : ""}`;
    el.title = waymarkName(s);
    strip.appendChild(el);
  }
  return strip;
}

// Localized "zelená prerušovaná" / "green dashed"; `none` has no qualifier (always dashed).
function waymarkName(s) {
  const L_ = lang();
  const color = t(DICT, `waymark.${s.color}`, L_);
  return s.color !== "none" && s.style === "dashed" ? `${color} ${t(DICT, "waymark.dashed", L_)}` : color;
}
```

In `renderRow`, after the `top.append(name, badge);` line, insert:

```js
  const swatches = swatchStrip(hike);
  if (swatches) top.appendChild(swatches);
```

- [ ] **Step 3: Detail panel row** — in `openDetail`, directly after the parking block (`if (ends) { ... }`), insert:

```js
  const wmSwatches = swatchStrip(hike, true);
  if (wmSwatches) {
    const wm = document.createElement("div");
    wm.className = "detail-waymarks";
    const label = document.createElement("strong");
    label.textContent = `${t(DICT, "detail.waymarks", L_)} `;
    const names = swatchList(hike.waymark_segments).map((s) => waymarkName(s)).join(" · ");
    wm.append(label, wmSwatches, document.createTextNode(` ${names}`));
    panel.appendChild(wm);
  }
```

- [ ] **Step 4: CSS** — in `css/styles.css`, after the `.closure-x` rules, add:

```css
/* Waymark swatches: small line samples (solid bar / dashed bar) in list rows + detail. */
.wm-strip { display: inline-flex; gap: 4px; align-items: center; margin-left: 6px; }
.wm-swatch { display: inline-block; width: 14px; height: 4px; border-radius: 2px; background: var(--wm-c); }
.wm-swatch--lg { width: 22px; height: 5px; }
.wm-swatch--dashed { background: repeating-linear-gradient(90deg, var(--wm-c) 0 4px, transparent 4px 7px); }
.wm-swatch--red    { --wm-c: #e53935; }
.wm-swatch--blue   { --wm-c: #1565c0; }
.wm-swatch--green  { --wm-c: #2e7d32; }
.wm-swatch--yellow { --wm-c: #f9a825; }
.wm-swatch--none   { --wm-c: #78909c; }
.detail-waymarks { font-size: 13px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.detail-waymarks strong { color: var(--muted); font-weight: 600; }
```

- [ ] **Step 5: Verify + commit**

Run: `node --check js/trails.js` clean; `node --test` green. Browser: no swatches appear yet (no data) — verify no errors and the detail panel renders normally.

```bash
git add js/i18n.js js/trails.js css/styles.css
git commit -m "feat(board): waymark swatches in list rows + detail panel (F)"
```

---

### Task 8: Admin — waymarks editor (segment rows, click-to-split, dimming)

**Files:**
- Modify: `admin.html` (after the `.admin-geom` div, ~line 87)
- Modify: `js/admin/ui.js`
- Modify: `css/styles.css`

- [ ] **Step 1: Markup** — in `admin.html`, directly after the `</div>` that closes `<div class="admin-geom">`, insert:

```html
        <fieldset class="admin-waymarks">
          <legend>Waymarks</legend>
          <div id="wm-seg-list"></div>
          <div class="admin-wm-actions">
            <button id="wm-add-split" class="chip" type="button">+ Add split</button>
            <button id="wm-reset" class="chip" type="button">Reset</button>
            <span id="wm-hint" class="admin-msg"></span>
          </div>
        </fieldset>
```

- [ ] **Step 2: Editor logic** — in `js/admin/ui.js`:

(a) Extend imports: add `nearestPointIndex, segmentPolylines` to a new import line:

```js
import { nearestPointIndex } from "../waymarks.js";
```

(b) Add module state next to `ADMIN_ROUTE`:

```js
let MARK_MODE = null;   // null | "split" | { type: "extent", write: (from, to) => void, clicks: [] }
let ANCHOR_DOTS = null; // L.layerGroup of split/extent dots over the route
```

(c) `blankHike()` gains (inside the returned object): `waymark_segments: null, seasonal_extent_from: null, seasonal_extent_to: null,` and `editHike()` passes them through from the row: `waymark_segments: row.waymark_segments ?? null, seasonal_extent_from: row.seasonal_extent_from ?? null, seasonal_extent_to: row.seasonal_extent_to ?? null,` (closures already spread extents via `{ ...c }`).

(d) `formToHike()` gains:

```js
    waymark_segments: state.waymark_segments,
    seasonal_extent_from: state.seasonal_extent_from ?? null,
    seasonal_extent_to: state.seasonal_extent_to ?? null,
```

(e) `normalizeClosure()` gains: `extent_from: c.extent_from || null, extent_to: c.extent_to || null,` in the `out` object.

(f) The waymarks block renderer + split logic (add after `renderClosures`):

```js
// ---- waymarks editor (Increment F) ----
const WM_COLORS = ["red", "blue", "green", "yellow", "none"];

function segsForEdit() {
  return Array.isArray(state.waymark_segments) && state.waymark_segments.length
    ? state.waymark_segments
    : [{ color: "none", style: "dashed" }];
}

function renderWaymarks() {
  const wrap = $("wm-seg-list");
  wrap.innerHTML = "";
  const segs = segsForEdit();
  segs.forEach((seg, i) => {
    const row = document.createElement("div");
    row.className = "admin-wm-row";
    const colorSel = document.createElement("select");
    for (const c of WM_COLORS) {
      const o = document.createElement("option");
      o.value = c; o.textContent = c === "none" ? "unmarked" : c;
      colorSel.appendChild(o);
    }
    colorSel.value = WM_COLORS.includes(seg.color) ? seg.color : "none";
    const styleSel = document.createElement("select");
    for (const s of ["solid", "dashed"]) {
      const o = document.createElement("option");
      o.value = s; o.textContent = s;
      styleSel.appendChild(o);
    }
    const syncStyle = () => {
      if (colorSel.value === "none") { styleSel.value = "dashed"; styleSel.disabled = true; }
      else styleSel.disabled = false;
    };
    styleSel.value = seg.style === "dashed" ? "dashed" : "solid";
    syncStyle();
    colorSel.addEventListener("change", () => {
      syncStyle();
      materialize()[i].color = colorSel.value;
      if (colorSel.value === "none") materialize()[i].style = "dashed";
      redrawPreview();
    });
    styleSel.addEventListener("change", () => { materialize()[i].style = styleSel.value; redrawPreview(); });
    row.append(`#${i + 1} `, colorSel, styleSel);
    if (seg.until) {
      const rm = document.createElement("button");
      rm.type = "button"; rm.className = "chip admin-danger"; rm.textContent = "✕ split";
      rm.title = "Remove this split (merges with the next segment)";
      rm.addEventListener("click", () => {
        const arr = materialize();
        delete arr[i].until; // segment now runs to where the NEXT one ends
        arr.splice(i + 1, 0); // no-op splice keeps intent obvious: colors of both halves remain
        // merging: drop this row's until; identical neighbours are fine (render normalizes)
        redrawPreview(); renderWaymarks();
      });
      row.append(rm);
    }
    wrap.appendChild(row);
  });
}

// Editing materializes the default single segment into real state.
function materialize() {
  if (!Array.isArray(state.waymark_segments) || !state.waymark_segments.length) {
    state.waymark_segments = [{ color: "none", style: "dashed" }];
  }
  return state.waymark_segments;
}

function armSplit() {
  MARK_MODE = MARK_MODE === "split" ? null : "split";
  $("wm-hint").textContent = MARK_MODE === "split" ? "Click the route where the marking changes…" : "";
  $("wm-add-split").classList.toggle("armed", MARK_MODE === "split");
  redrawPreview();
}

function resetWaymarks() {
  state.waymark_segments = null;
  MARK_MODE = null;
  $("wm-hint").textContent = "";
  renderWaymarks(); redrawPreview();
}

function applySplitClick(snapIdx) {
  const coords = state.geometry.coordinates;
  const arr = materialize();
  // Which segment contains snapIdx? Walk the same way segmentPolylines does.
  const endIdx = (seg) => (seg.until ? nearestPointIndex(coords, seg.until) : coords.length - 1);
  let from = 0;
  for (let i = 0; i < arr.length; i++) {
    const end = endIdx(arr[i]);
    if (snapIdx > from && snapIdx < end) {
      // split segment i at snapIdx: first half keeps colour/style and gets the new anchor
      arr.splice(i, 0, { color: arr[i].color, style: arr[i].style, until: coords[snapIdx] });
      break;
    }
    from = Math.max(end, from);
  }
  MARK_MODE = null;
  $("wm-add-split").classList.remove("armed");
  $("wm-hint").textContent = "";
  renderWaymarks(); redrawPreview();
}

function onPreviewClick(e) {
  if (!MARK_MODE || !state || !state.geometry) return;
  const clicked = [e.latlng.lng, e.latlng.lat];
  const idx = nearestPointIndex(state.geometry.coordinates, clicked);
  const snapped = state.geometry.coordinates[idx];
  if (MARK_MODE === "split") { applySplitClick(idx); return; }
  if (MARK_MODE.type === "extent") {
    MARK_MODE.clicks.push(snapped);
    if (MARK_MODE.clicks.length === 2) {
      MARK_MODE.write(MARK_MODE.clicks[0], MARK_MODE.clicks[1]);
      MARK_MODE = null;
      $("wm-hint").textContent = "";
      renderClosures(); renderSeasonalExtent(); redrawPreview();
    } else {
      $("wm-hint").textContent = "Now click where the closed part ends…";
      redrawPreview(); // shows the first dot
    }
  }
}
```

(g) Live preview — REPLACE `drawAdminRoute` with:

```js
// Active closures from the LIVE form (same inputs as updateBadge), annotated for ✕ markers.
function liveClosuresForMap() {
  const from = $("f-seasonal-from").value.trim();
  const to = $("f-seasonal-to").value.trim();
  const seasonal = from && to
    ? { from, to, partial: $("f-seasonal-partial").checked,
        extent_from: state.seasonal_extent_from ?? null, extent_to: state.seasonal_extent_to ?? null }
    : null;
  const adhoc = state.closures.filter((c) => !c._deleted)
    .map((c) => ({ from_date: c.from_date || null, to_date: c.to_date || null, partial: !!c.partial,
      extent_from: c.extent_from || null, extent_to: c.extent_to || null }));
  return computeStatus(seasonal, adhoc, today()).activeClosures
    .map((c) => ({ ...c, label: c.kind === "seasonal" ? "Seasonal closure" : "Closure" }));
}

function redrawPreview() {
  if (!state) return;
  drawAdminRoute(state.geometry, { fit: false });
}

function drawAdminRoute(geometry, { fit = true } = {}) {
  if (ADMIN_ROUTE) { ADMIN_MAP.removeLayer(ADMIN_ROUTE); ADMIN_ROUTE = null; }
  if (ANCHOR_DOTS) { ADMIN_MAP.removeLayer(ANCHOR_DOTS); ANCHOR_DOTS = null; }
  if (!geometry || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return;
  ADMIN_ROUTE = routeLayer(geometry, {
    segments: state ? state.waymark_segments : null,
    closures: state ? liveClosuresForMap() : [],
    dim: !!MARK_MODE,
  }).addTo(ADMIN_MAP);
  ANCHOR_DOTS = L.layerGroup(anchorDots(geometry)).addTo(ADMIN_MAP);
  $("admin-map").classList.toggle("marking", !!MARK_MODE);
  if (!fit) return;
  const b = ADMIN_ROUTE.getBounds();
  if (b.isValid()) ADMIN_MAP.fitBounds(b, { padding: [30, 30] });
}

// Small full-opacity dots: every split anchor + the pending first extent click.
function anchorDots(geometry) {
  const dots = [];
  const dot = ([lon, lat]) => L.circleMarker([lat, lon],
    { radius: 5, color: "#fff", weight: 2, fillColor: "#1565c0", fillOpacity: 1 });
  for (const seg of state.waymark_segments || []) {
    if (Array.isArray(seg.until)) dots.push(dot(seg.until));
  }
  if (MARK_MODE && MARK_MODE.type === "extent") for (const c of MARK_MODE.clicks) dots.push(dot(c));
  return dots;
}
```

(h) `loadEditor()` — add `renderWaymarks(); renderSeasonalExtent();` after `renderClosures();` and reset `MARK_MODE = null;` at the top of `loadEditor`. (`renderSeasonalExtent` arrives in Task 9 — within THIS task add a stub `function renderSeasonalExtent() {}` that Task 9 replaces, so the file runs.)

(i) `ensureMap()` — register the click handler once:

```js
function ensureMap() {
  if (!ADMIN_MAP) {
    ADMIN_MAP = initMap("admin-map");
    ADMIN_MAP.on("click", onPreviewClick);
  }
  ADMIN_MAP.invalidateSize();
}
```

(j) `onGpxChange` — change `drawAdminRoute(state.geometry);` to `drawAdminRoute(state.geometry);` (unchanged signature still works) and `boot()` — add:

```js
  $("wm-add-split").addEventListener("click", armSplit);
  $("wm-reset").addEventListener("click", resetWaymarks);
```

Also: the `updateBadge`-triggering seasonal/closure inputs should re-render the preview so ✕ markers track the form live — in `renderClosures`'s input listener after `updateBadge();` add `redrawPreview();`, and change the boot line for seasonal fields to:

```js
  ["f-seasonal-from", "f-seasonal-to", "f-seasonal-partial"].forEach((id) =>
    $(id).addEventListener("input", () => { updateBadge(); redrawPreview(); }));
```

- [ ] **Step 3: CSS** — append after the swatch rules:

```css
/* Admin waymarks editor */
.admin-waymarks { border: 1px solid var(--chrome-border); border-radius: var(--radius); }
.admin-wm-row { display: flex; gap: 6px; align-items: center; margin: 4px 0; font-size: 13px; }
.admin-wm-actions { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
.chip.armed { background: var(--accent); color: #fff; }
.admin-map.marking { cursor: crosshair; }
```

- [ ] **Step 4: Verify**

`node --check js/admin/ui.js` clean; `node --test` green. Browser (`admin.html`, signed in): upload/select a hike → Waymarks block shows one "unmarked" row; Add split → map dims, crosshair, click route → two rows + blue dot; colors/styles change the preview live; Reset reverts to neutral; Save persists (check by re-selecting the hike). **Hard-refresh first.**

- [ ] **Step 5: Commit**

```bash
git add admin.html js/admin/ui.js css/styles.css
git commit -m "feat(admin): waymark segment editor — click-to-split, live preview, dimming (F)"
```

---

### Task 9: Admin — closure + seasonal extents (two-click mode)

**Files:**
- Modify: `js/admin/ui.js` (`renderClosures`, the `renderSeasonalExtent` stub, `addClosure`)
- Modify: `admin.html` (seasonal block)

- [ ] **Step 1: Markup** — in `admin.html`, find the seasonal inputs (`#f-seasonal-from` / `#f-seasonal-to` / `#f-seasonal-partial` — read the file) and add directly after the partial checkbox, inside the same form section:

```html
        <div class="admin-wm-actions">
          <button id="seasonal-extent" class="chip" type="button">Set extent</button>
          <button id="seasonal-extent-clear" class="chip" type="button" hidden>Clear extent</button>
          <span id="seasonal-extent-status" class="admin-msg"></span>
        </div>
```

- [ ] **Step 2: Seasonal extent logic** — in `js/admin/ui.js`, REPLACE the Task-8 stub:

```js
function renderSeasonalExtent() {
  const has = !!(state.seasonal_extent_from && state.seasonal_extent_to);
  $("seasonal-extent-status").textContent = has ? "extent ✓" : "";
  $("seasonal-extent-clear").hidden = !has;
}

function armSeasonalExtent() {
  MARK_MODE = { type: "extent", clicks: [], write: (from, to) => {
    state.seasonal_extent_from = from;
    state.seasonal_extent_to = to;
  } };
  $("wm-hint").textContent = "Click where the closed part STARTS…";
  redrawPreview();
}
```

and in `boot()`:

```js
  $("seasonal-extent").addEventListener("click", armSeasonalExtent);
  $("seasonal-extent-clear").addEventListener("click", () => {
    state.seasonal_extent_from = null; state.seasonal_extent_to = null;
    renderSeasonalExtent(); redrawPreview();
  });
```

- [ ] **Step 3: Per-closure extents** — in `renderClosures()`, extend the fieldset template: after the `<button ... data-remove="1" ...>✕</button>` line add

```html
      <button type="button" class="chip" data-extent="1">Set extent</button>
      <span class="admin-msg" data-extent-status="1"></span>
```

and after the existing `[data-remove]` listener wire-up add:

```js
    const extBtn = fs.querySelector("[data-extent]");
    const extStatus = fs.querySelector("[data-extent-status]");
    const syncExtent = () => {
      const has = !!(c.extent_from && c.extent_to);
      extStatus.textContent = has ? "extent ✓" : "";
      extBtn.textContent = has ? "Clear extent" : "Set extent";
    };
    syncExtent();
    extBtn.addEventListener("click", () => {
      if (c.extent_from && c.extent_to) {
        c.extent_from = null; c.extent_to = null;
        syncExtent(); redrawPreview(); return;
      }
      MARK_MODE = { type: "extent", clicks: [], write: (from, to) => {
        c.extent_from = from; c.extent_to = to;
      } };
      $("wm-hint").textContent = "Click where the closed part STARTS…";
      redrawPreview();
    });
```

In `addClosure()`, extend the pushed object with `extent_from: null, extent_to: null`.

- [ ] **Step 4: Verify**

`node --check js/admin/ui.js`; `node --test` green. Browser: add a closure dated today → ✕ along whole route; Set extent + two clicks → ✕ only between the dots (clicks in reverse order too); Clear → whole route again; mark it Partial without extent → NO ✕; seasonal range covering today + seasonal extent → same behavior; Save, re-select hike → everything persisted. Hard-refresh first.

- [ ] **Step 5: Commit**

```bash
git add admin.html js/admin/ui.js
git commit -m "feat(admin): closure + seasonal extent two-click marking (F)"
```

---

### Task 10: Final verification (suite + manual checklist + user-gated migration/push)

**Files:** none

- [ ] **Step 1: Full suite**

Run: `node --test` — every file green, no skips.

- [ ] **Step 2: Manual browser checklist** (serve repo root, hard-refresh both pages; admin tests run against live Supabase — the user must run `db/add-waymarks.sql` FIRST or saves will fail)

1. Admin: segment a real hike (e.g. blue→red), set styles incl. one dashed; live preview matches choices; Save → re-select → persisted.
2. Public: that hike's line renders the same segments; solid vs dashed visible; both themes.
3. Unmarked/unsegmented hike → neutral dashed grey; E flags intact on all hikes.
4. List: swatches after names (incl. a dashed swatch); detail: Waymarks row, names flip EN⇄SK.
5. Closure with extent → ✕ only on the stretch; tooltip shows reason + range; extent-less full closure → whole route; extent-less partial → no ✕; seasonal closure covering today behaves identically (set a temporary seasonal range to test, then restore).
6. Marking modes: dimmed route + crosshair while armed, base-map markings visible underneath; split dots full-opacity; disarm restores.
7. Expanded-list tint: region + nested band, both themes, no horizontal shift.
8. GPX re-upload on a segmented hike: anchors re-snap; preview stays sane.

- [ ] **Step 3: STOP — user-gated deploy**

Report results. **Do NOT `git push`.** Deploy order the user drives: (1) run `db/add-waymarks.sql` in the Supabase SQL Editor, (2) verify admin saves work against the migrated DB, (3) push master (Pages deploy).

---

## Self-review notes

- Spec coverage: per-segment colors+styles (T2/T6/T8), none-always-dashed (T2 normalization + T8 UI lock), closure extents incl. seasonal-on-hike (T3/T5/T9), marker rules incl. extent-less-partial-none (T6), seasonal automation via activeClosures (T5/T6), swatches list+detail+i18n (T4/T7), expanded tint early+independent (T1), admin dimming (T8 `dim`), migration-before-deploy ordering (gotchas + T10), status classes retired (T6 Step 2).
- Type consistency: `waymark_segments` array shape `{color, style, until?}` everywhere; `[lon, lat]` in all pure code; Leaflet swap confined to `route-layer.js` + `onPreviewClick`; `drawAdminRoute(geometry, { fit })` matches its public-board sibling.
- Known judgment calls for the implementer to preserve: `routeLayer` no longer takes `status` (callers updated in T6); `currentStatus()` deleted in T6; the Task-8 `renderSeasonalExtent` stub is replaced in T9.
