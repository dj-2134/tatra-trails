# Waymarked Routes + List Polish (Increment F) — Design

**Date:** 2026-06-12
**Status:** Approved by user (brainstorming session; visual companion used for closure-on-map and expanded-list choices)

## Goal

1. **Waymarked routes:** the drawn trail shows the official KST waymark marking it follows —
   per segment, in color (red/blue/green/yellow) AND line style (solid/dashed), replacing the
   current status-colored always-dashed line. Closures move to **red ✕ markers** on the map,
   placed only on the actually-closed stretch when the closure has an extent.
2. **List polish:** an expanded list group must *look* expanded — soft accent tint + left
   accent bar (visual option A), fixing today's flat look where only the ▸ caret rotates.

Frontend + one DB migration. Builds on Increment E's flags and `js/route-endpoints.js`.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Waymark granularity | **Per-segment** (not per-hike color set) — the map paints each stretch in its true marking |
| Segment dimensions | `color` ∈ red/blue/green/yellow/**none** AND `style` ∈ solid/dashed; **none is always dashed** (custom/unmarked stretches, incl. friends-only bushwhacks) |
| Admin input | **Click-to-split on the map preview** (snap to nearest route vertex), not typed distances |
| Closure display on map | **Option B: waymark colors stay; red ✕ markers along the closed part** (not greyed-out line, not status halo) |
| Partial closures | **No orange variant** — ✕ is always red because extents localize it; see marker rules below |
| Closure extent | Optional per closure: two-click from→to on the admin preview; no extent = whole route (full closures) |
| Seasonal automation | Markers derive from `status.js` activeClosures — seasonal ✕ appear/disappear by date automatically, extents stored once and reused every year |
| Storage | **Anchor coordinates + render-time snapping** (JSONB on hikes, two columns on closures) — not materialized segment geometries, not a normalized table. Anchors survive GPX re-uploads |
| Swatches in UI | Yes — line swatches (showing solid/dashed!) in list rows + detail panel; dots rejected because they can't show style |
| Expanded-list treatment | **Option A: tint + accent bar** (over lifted cards / tree rails) |
| Admin marking aid | While a click-mode is armed, the route overlay dims to **~40% opacity** so the base map's own trail rendering is visible for aiming; restores on disarm |

## Data model — `db/add-waymarks.sql` (user runs in SQL Editor)

```sql
alter table hikes    add column if not exists waymark_segments jsonb;
alter table hikes    add column if not exists seasonal_extent_from jsonb;
alter table hikes    add column if not exists seasonal_extent_to   jsonb;
alter table closures add column if not exists extent_from jsonb;
alter table closures add column if not exists extent_to   jsonb;
```

**Why two homes for extents:** ad-hoc closures are `closures` rows, but the seasonal closure
is a set of `seasonal_*` columns on the hike itself — so its extent lives on the hike
(`seasonal_extent_from/to`). `computeStatus()` passes both through into `activeClosures`
(the ad-hoc row spread carries them for free; the seasonal push adds them explicitly).

- `hikes.waymark_segments`: ordered array; each element
  `{ "color": "red"|"blue"|"green"|"yellow"|"none", "style": "solid"|"dashed", "until": [lon,lat]? }`.
  `until` = the split anchor clicked in the admin; the **last segment omits it** (runs to the
  route end). `null`/absent column value = hike not yet segmented.
- `closures.extent_from` / `extent_to`: `[lon, lat]` anchors or null. Both set = closure
  applies to that stretch; both null = whole route.
- No RLS changes: both tables' existing read/write policies already cover the new columns.

## Components

### New: `js/waymarks.js` (pure, TDD)

- `nearestPointIndex(coords, [lon,lat])` → index of the nearest route vertex (haversine from
  `js/stats.js`; routes are decimated to ≤ ~500 points, O(n) is fine).
- `segmentPolylines(geometry, waymarkSegments)` → `[{ color, style, coords }]`:
  - snaps each `until` anchor, sorts snapped indices ascending (out-of-order anchors are
    re-sorted, never an error), slices the LineString;
  - adjacent slices **share the boundary vertex** so polylines join seamlessly;
  - zero-length slices (two anchors snapping to the same vertex) are dropped;
  - normalization: unknown color → `none`; unknown style → `solid`; `color:"none"` forces
    `style:"dashed"`;
  - missing/invalid `waymarkSegments` (or invalid geometry per `routeEndpoints` rules) →
    one fallback segment `{ color:"none", style:"dashed", coords: <all> }` — "no info yet"
    and "unmarked" deliberately look the same.
- `closureStretch(geometry, from, to)` → coords of the closed stretch; anchors normalized
  so from-index ≤ to-index regardless of click order; null on invalid input.
- `closureMarkerPositions(stretchCoords, { spacingM = 400 } = {})` → `[lon,lat][]`:
  one marker per ~400 m along the stretch, **minimum one (the stretch midpoint), maximum 15**
  (a 30 km seasonal closure must not carpet the map).
- `swatchList(waymarkSegments)` → deduplicated, route-ordered `[{ color, style }]` for the
  list/detail swatches ("green, dashed green, green again" → two entries).

### Changed: `js/route-layer.js` (Leaflet glue, shared by public map + admin preview)

- **Signature change (both call sites updated in this increment):**
  `routeLayer(geometry, { labels, segments, closures, dim } = {})` — the `status` parameter
  is REMOVED; the line no longer encodes status.
- Renders: one casing (unchanged white/dark) + **one polyline per
  `segmentPolylines()` piece** — weight 6; solid = no dashArray, dashed = the current
  `"8 14"`; stroke via new CSS classes `path.trail-wm--red|blue|green|yellow|none`
  (status classes `trail--open|closed|partial` are retired from the line; the badge palette
  in lists/detail is untouched).
  Colors: red `#e53935`, blue `#1565c0`, green `#2e7d32`, yellow `#f9a825`, none `#78909c`.
- **✕ closure markers:** white-disc divIcons with a red ✕ (`.closure-x`, same drop-shadow
  casing strategy as the E flags), with a tooltip showing the closure's date range + reason.
  Placement per active closure (`closures` opt = the hike's `activeClosures`, each carrying
  its extent anchors when set):
  - extent set → markers along `closureStretch()` only;
  - no extent + **full** closure → markers along the whole route;
  - no extent + **partial** closure → **no map markers** (badge/detail still say partial).
- `dim: true` renders the whole group (casing + lines, not the E flags or split dots) at
  ~0.4 opacity — used by the admin while a click-mode is armed.
- E's start/finish flags render on top, unchanged.

### Changed: `js/trails.js` (public board)

- Passes `segments: hike.waymark_segments` and `closures: hike.activeClosures` (each
  active closure annotated with its `extent_from`/`extent_to`) into `routeLayer()`.
- List rows: swatch strip after the hike name — small line swatches (~12×4px CSS/SVG bars,
  solid or dashed, waymark-colored) from `swatchList()`; nothing rendered when the hike has
  no waymark data.
- Detail panel: a "Waymarks" / SK "Značenie" row — larger swatches + localized names joined
  with "·" (e.g. "zelená · zelená prerušovaná · neznačené"). Omitted entirely when no data.
- `js/data.js`: request the new columns (`waymark_segments` on hikes; `extent_from`,
  `extent_to` on closures) and map them onto prepared hikes/closures.

### Changed: admin (`js/admin/ui.js`, `js/admin/store.js`, `admin.html`)

- **Waymarks block** under the existing map preview:
  - one row per segment: color `<select>` (Red/Blue/Green/Yellow/Unmarked) + style toggle
    (Solid/Dashed; **locked to Dashed when Unmarked**);
  - **"Add split"** arms click-mode: clicks snap to the nearest route vertex, a small
    white dot marks each split on the preview, a new segment row appears; each split row
    has a remove ✕;
  - the preview re-renders **live** through the same `routeLayer()` so the admin sees
    exactly what the public map will show.
- **Closure extents:** each ad-hoc closure row gains "Set extent" → arms a two-click mode
  (from → to on the preview), then shows "extent ✓ / Clear". Optional per closure. The
  seasonal-closure form block gets the same Set/Clear extent controls, stored on the hike
  (`seasonal_extent_from/to`).
- **Marking-mode transparency:** while either click-mode is armed, the route overlay is
  re-rendered with `dim: true` (~40% opacity) so the mapy.com base rendering underneath is
  visible for aiming; split/extent dots stay full-opacity; disarming restores normal.
- Save: `waymark_segments` persists with the hike; extent anchors persist with each closure
  (`store.js` upsert payloads extended). Admin remains English-only.

### Changed: `css/styles.css`

- `path.trail-wm--*` stroke colors (5); `.closure-x` styling; swatch styles for list/detail.
- **Expanded-group tint (option A):** `region-group[open]` gets a soft accent-tinted
  background + 3px left accent bar; `hike-group[open]` inside tints one step deeper;
  collapsed groups unchanged; dark mode uses a translucent accent overlay on the existing
  blurred chrome instead of light green. CSS-only, no layout shift.
  This is an **independent early task** in the plan — it ships even if the increment pauses.

### Changed: `js/i18n.js`

New keys: `waymark.red/blue/green/yellow/none` (EN red/blue/green/yellow/unmarked; SK
červená/modrá/zelená/žltá/neznačené), `waymark.dashed` (EN "dashed", SK "prerušovaná"),
`detail.waymarks` (EN "Waymarks", SK "Značenie"). Localized name pattern: color name, plus
the dashed qualifier when `style:"dashed"` (e.g. "zelená prerušovaná" / "green dashed");
`none` is just "unmarked"/"neznačené" (no qualifier — it is always dashed).

## Edge cases

- **GPX re-upload after segmenting:** anchors re-snap to the new geometry; a drastically
  re-shaped route may need splits re-clicked — immediately visible in the live preview;
  nothing errors.
- **Anchors snapping to the same vertex:** zero-length segment dropped silently.
- **Inactive closure with extent:** no markers (everything is driven by `status.js`'s
  active set — which is also what makes seasonal markers fully automatic).
- **Hike with no geometry:** no segments, no markers, no swatches — same null path as E.
- **Search/bands:** untouched; swatches are display-only.

## Testing

- **TDD (`node --test`) for `js/waymarks.js`:** snapping; slicing incl. shared boundary
  vertex; out-of-order anchor re-sorting; zero-length drop; none→dashed and unknown-value
  normalization; fallback segment for missing data; closure stretch incl. reversed clicks;
  marker spacing, midpoint minimum, 15 cap; swatch dedup in route order.
- **Manual checklist** (glue; hard-refresh Ctrl+Shift+R): multi-color solid/dashed rendering
  in both themes; live preview while splitting; lock-to-dashed for Unmarked; extent two-click
  flow incl. reversed order; marking-mode dimming (base map visible); ✕ tooltips; seasonal
  auto-appearance (temporarily set a seasonal range covering today); whole-route ✕ for
  extent-less full closure; NO ✕ for extent-less partial closure; swatches in list + detail
  in EN and SK; expanded-list tint at both nesting levels in both themes; E flags still on top.

## Out of scope

- Per-segment closure *reasons* or multi-extent closures (one extent per closure row; add
  a second closure row if a trail is closed in two places).
- Deriving waymarks automatically from OSM data.
- Any change to status computation, badges, search, or band grouping.
- Freemium and photo gallery — separate future increments.

## Scope note

Biggest increment since the admin UI: migration + pure module + map overhaul + admin editor
+ CSS polish. Single spec because the pieces share one data model and one rendering path;
the plan (~10–12 tasks) sequences the independent CSS polish early.
