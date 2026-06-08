# TatraTrails — Hike Stats (Increment A) — Design Spec

**Date:** 2026-06-08
**Status:** Design approved in brainstorming; ready for implementation planning.
**Builds on:** the live Phase 2 admin UI (`2026-06-05-admin-ui-design.md`) and the public board.

> **Roadmap context.** The "add stats" idea expanded into a four-increment roadmap, each its own
> spec → plan → build: **A) Hike stats** (this spec) → **B) distance-grouped list** →
> **C) regions** → **D) visibility/privacy (public/friends/owner)**. This spec covers **Increment A only**.
> Display formats here (a flat list row with stats) are deliberately compatible with B's later grouping.

---

## 1. Purpose

Show each hike's **distance**, **elevation gain**, and **walking time** on the public board (detail panel
and list row) and let the admin manage them. Distance, elevation gain, and a walking-time estimate are
**auto-derived from the uploaded GPX** and pre-filled into the admin editor, each **manually overridable**.
A **metric ⇄ imperial** toggle (metric default) controls the public display units.

---

## 2. Scope

**In scope:**
- Three new nullable `hikes` columns: `distance_m`, `ascent_m`, `duration_min`.
- GPX-derived stats: distance (haversine), elevation gain (summed `<ele>` ascent), walking time
  (Naismith estimate) — pre-filled on upload, overridable.
- Admin editor: three stat fields + a **live map preview** of the route (reusing the public map).
- Public display: stats in the detail panel and as a compact line per hike-list row.
- A **units toggle** (metric/imperial) on the public site, persisted in `localStorage`.

**Out of scope (later increments / YAGNI):**
- Grouping/categorising the list by distance, and **collapsible list rows / category sections**
  (**Increment B** — collapsibility is built with the list overhaul, so it's designed once; in A the
  rows simply show a compact stat line and the list stays scrollable, with full stats one tap away in the
  detail panel).
- Regions (**Increment C**).
- Visibility / public-friends-owner access control (**Increment D**).
- Imperial **input** in the admin (admin entry stays metric).
- Per-segment elevation profiles, descent, difficulty grading, GPX with multiple tracks merged.

---

## 3. Data model

Three new **nullable integer** columns on `hikes` (all `>= 0`):

```sql
distance_m   integer check (distance_m   is null or distance_m   >= 0)  -- meters
ascent_m     integer check (ascent_m     is null or ascent_m     >= 0)  -- meters of elevation gain
duration_min integer check (duration_min is null or duration_min >= 0)  -- minutes (walking time)
```

- Nullable, so existing rows are unaffected until edited/re-saved.
- `db/schema.sql` is updated for fresh setups; a one-off **`db/add-hike-stats.sql`** (`ALTER TABLE … add
  column if not exists …`, safe to re-run) is run once in the Supabase SQL Editor against the live DB.
- **RLS unchanged** — the existing public-read and admin-write policies already cover all columns.
- Geometry stays `[lon, lat]` (no elevation stored in it).

---

## 4. Value production

### 4.1 On GPX upload (admin)
The upload flow parses the GPX once and computes:
- **`distanceM`** — haversine sum over the **full track** (all parsed points, *before* the ≤500-point
  decimation that produces the map geometry), so it reflects the true route length.
- **`ascentM`** — sum of **positive** consecutive `<ele>` deltas. **`null`** when the GPX has fewer than
  two points carrying elevation (we never report `0 m` ascent for a mountain route that simply lacks data).
- **`durationMin`** — `estimateDurationMin(distanceM, ascentM)` (Naismith, §4.2).

All three pre-fill the (editable) admin fields. Re-uploading re-fills them; editing a field without
re-uploading keeps the typed value.

### 4.2 Naismith walking-time estimate
```
estimateDurationMin(distanceM, ascentM):
  FLAT_MIN_PER_KM = 12          // ~5 km/h
  ASCENT_MIN_PER_M = 0.1        // 1 hour per 600 m  (60 / 600)
  return round(distanceM / 1000 * FLAT_MIN_PER_KM + (ascentM || 0) * ASCENT_MIN_PER_M)
```
Constants are named so the pace is easy to tune. `null`/absent ascent contributes nothing (flat-only estimate).

### 4.3 Distance fallback (public)
`hikes.js` sets `distance_m = row.distance_m ?? round(lineDistanceMeters(geometry.coordinates))`. This means
every hike with a route shows a distance even if it predates this feature (computed from the stored,
decimated geometry — marginally shorter than the full-track value, acceptable for display/grouping).
`ascent_m` and `duration_min` have **no fallback** — they display only when stored.

---

## 5. Admin editor

### 5.1 Stat fields
Added after the GPX control, with a hint *"auto-filled from GPX — edit if needed"*:
- **Distance** — one number input in **km** (e.g. `12.3`); stored as meters (`round(km * 1000)`).
- **Elevation gain** — one number input in **m** (e.g. `540`); left **blank** when the GPX has no elevation.
- **Walking time** — **hours + minutes** inputs (e.g. `3` h `30` min); stored as `duration_min`.

`loadEditor` populates them from stored values (m→km, min→h/min); `formToHike` converts back, storing
`null` for any blank field. Editing a pre-feature hike shows them blank until filled or a GPX is re-uploaded.

### 5.2 Map preview
A **map panel at the top of the editor pane** (full editor width, ~280px tall):
- `admin.html` loads **Leaflet** (same unpkg CDN + integrity as `index.html`) and adds `<div id="admin-map">`.
- `ui.js` calls the existing **`initMap("admin-map")`** once (Mapy tiles + layer switcher + logo; same
  `MAPY_API_KEY` CI already injects). Because the editor pane starts hidden, it calls Leaflet's
  **`invalidateSize()`** each time the editor opens so tiles lay out correctly.
- **Select an existing hike** → draw its stored route, zoom to fit. **Upload a GPX** → draw the newly-parsed
  route (preview) and zoom to fit, at the same moment the stat fields auto-fill. **New hike, no route** →
  default Tatras view, no route. Drawing uses the shared `routeLayer(geometry, status)` (§7) in the hike's
  live status colour (the same status the editor badge already computes).

### 5.3 Validation
`validate.js` `validateHike` gains optional checks: each of `distance_m`, `ascent_m`, `duration_min`, when
present, must be a finite number `>= 0` (whole numbers). Blank = `null` (valid). Inline messages; the DB
`CHECK`s remain the backstop.

---

## 6. Public display

### 6.1 Detail panel (`trails.js` `openDetail`)
A stats line just under the status badge, before the closures, with localized labels:
> **Distance** 12.3 km · **Elevation gain** 540 m · **Walking time** 3 h 30 min

### 6.2 Hike-list row (`renderList`)
A muted secondary line under the hike name, compact symbol form (fits the ~220px panel):
> `12.3 km · ↑540 m · 3 h 30 min`

Each stat appears **only when available**, joined by `·`; nothing renders for missing values.

### 6.3 Formats & units
A pure, units-aware, language-neutral formatter `js/stats-format.js`:
- `formatDistance(m, units)` — metric `(m/1000)` to 1 dp + `" km"`; imperial `(m/1609.344)` to 1 dp + `" mi"`.
- `formatAscent(m, units)` — metric `"↑" + round(m) + " m"`; imperial `"↑" + groupThousands(round(m*3.28084)) + " ft"`.
- `formatDuration(min)` — `null`→`""`; `< 60`→`"{m} min"`; exact hour→`"{h} h"`; else `"{h} h {m} min"`.
  (Units-independent — time is time.)
- Returns `""`/null for null inputs so callers can skip cleanly.

### 6.4 Units toggle
- A `.chip` toggle in the top-bar controls (beside language/theme) showing the active system (`km ⇄ mi`).
- `js/units.js` (mirrors `js/theme.js`): `getUnits()` (reads `localStorage` `tt-units`, default `"metric"`,
  invalid→`"metric"`), `toggleUnits()` (persists + dispatches `tt:unitchange`).
- `js/ui.js` wires the button; `trails.js` listens for **`tt:unitchange`** and re-renders the list + open
  detail — the same mechanism the existing **`tt:langchange`** uses.
- Public display only; the admin editor stays metric.

### 6.5 i18n
`js/i18n.js` `DICT` gains detail-panel label keys (EN / SK): Distance → *Dĺžka*, Elevation gain →
*Prevýšenie*, Walking time → *Čas*. Value formats (km/m/mi/ft/h/min/↑) are language-neutral.

---

## 7. Code structure

**New pure modules (unit-tested, like `status.js`):**
- `js/stats.js` — `lineDistanceMeters(coords)` (haversine over `[lon,lat]`, R = 6 371 000 m) and
  `estimateDurationMin(distanceM, ascentM)` (§4.2).
- `js/stats-format.js` — `formatDistance` / `formatAscent` / `formatDuration` (§6.3).

**New glue modules:**
- `js/units.js` — units preference (§6.4); mirrors `js/theme.js`.
- `js/route-layer.js` — `routeLayer(geometry, status)` returns the styled casing + bright dashed Leaflet
  `featureGroup` (unattached; caller adds to a map, fits bounds, clears). Extracted from `trails.js` so the
  public and admin maps draw identically and the casing/dash styling lives in one place.

**Modified:**
- `db/schema.sql` (+3 columns); **new** `db/add-hike-stats.sql` (live-DB migration).
- `js/gpx.js` — add `gpxStats(gpxText) → { distanceM, ascentM|null }` (parses lat/lon/ele; distance via
  `lineDistanceMeters`; ascent from ele). `gpxToLineString` unchanged.
- `js/data.js` + `js/admin/store.js` — add `distance_m,ascent_m,duration_min` to their SELECT strings.
- `js/hikes.js` — map the three fields; apply the distance fallback (§4.3).
- `js/trails.js` — render stats (detail + list) via `stats-format` + current units; listen for
  `tt:unitchange`; draw routes via `routeLayer`.
- `js/i18n.js` — label keys (§6.5).
- `index.html` + `js/ui.js` — add and wire the units toggle chip.
- `admin.html` — load Leaflet, add `#admin-map` + the three stat fields.
- `js/admin/ui.js` — init/redraw the map preview; pre-fill stats on upload (`gpxStats` +
  `estimateDurationMin`); load/save the fields with unit conversions.
- `js/admin/validate.js` — the optional non-negative checks (§5.3).
- `css/styles.css` — admin map box, stats lines (detail + list), units chip (reuses `.chip`).

---

## 8. Error handling

- **GPX without elevation** → `ascentM` null: elevation field left blank, duration uses the flat estimate.
  No error.
- **GPX parse error** → the existing inline "GPX error" message; stat fields are not touched.
- **Admin map** — if a geometry is missing/empty, skip drawing (no crash); the map stays on the prior view.
- **Public** — any missing stat is simply omitted from the detail line and list row.
- **Units** — an unrecognised stored `tt-units` value falls back to metric.
- **Validation** — non-negative/number checks run before any write; DB `CHECK`s are the backstop.

---

## 9. Testing

**Unit (`node:test`):**
- `tests/stats.test.js` — `lineDistanceMeters` vs a known coordinate pair within tolerance; `estimateDurationMin`
  (e.g. 10 km + 600 m → `10*12 + 600*0.1 = 180` min; flat-only when ascent null/0).
- `tests/stats-format.test.js` — `formatDistance`/`formatAscent` metric **and** imperial; `formatDuration`
  (`<1 h`, exact hour, `h`+`min`); null/empty handling.
- Extend `tests/gpx.test.js` — `gpxStats`: distance + ascent from a sample track; `ascentM` null when no
  `<ele>`; distance uses the full (un-decimated) track.
- Extend `tests/hikes.test.js` — distance fallback when `distance_m` is null; the three fields map through.
- Extend `tests/validate.test.js` — the new optional non-negative validations.

**Manual verification (glue):** the admin map preview + route drawing on select/upload; the units toggle
re-rendering the list + detail; GPX pre-fill in the admin; and the full loop — upload GPX → see the route and
auto-filled stats → save → public detail + list show the stats → toggle units → distance/elevation convert.

---

## 10. Deferred to implementation planning

1. Exact Naismith constants are fixed here (12 min/km, 600 m/h) but kept as named consts for easy tuning.
2. Precise admin map height/placement CSS and the stats-line layout (reuse `styles.css` vars).
3. The units-chip exact glyph/label wording.
4. `groupThousands` helper detail for imperial feet (deterministic, no locale dependency).
5. Whether the list row drops `walking time` at very narrow widths (default: show all three, wrap if needed).
