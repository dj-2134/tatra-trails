# Trail Endpoint Markers + Parking Link (Increment E) — Design

**Date:** 2026-06-12
**Status:** Approved by user (brainstorming session, visual companion used for placement + marker style)

## Goal

Make it obvious where a selected hike begins and ends, and give users a one-tap way to
scout parking near the trailhead. Plus one small admin string cleanup.

1. **Start & end flag markers** on the selected trail — public map and admin preview.
2. **"Parking near trailhead" link** in the trail detail panel — opens Google Maps
   searching for parking at the start point.
3. **String fix:** admin `errorText` "founder account" → "owner account"
   (`js/admin/ui.js`; the role model has been owner/friend since D2a).

Frontend only. No DB changes, no migrations, no new image assets.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| What does the Google Maps link open? | A **parking search** centered on the trailhead (not a plain pin, not directions) |
| Loop hikes (start ≈ end)? | **One combined start/finish marker** when endpoints are ≤ 100 m apart |
| Admin map preview too? | **Yes** — markers live in the shared `routeLayer()`, both maps stay identical |
| Where does the parking link live? | **Detail panel row** under the stats (chosen over marker popup / both) |
| Marker style? | **Flags** — green start flag, checkered finish flag (chosen over dots / symbol badges) |
| Implementation approach? | **CSS-styled Leaflet `divIcon`s with inline SVG** in the shared route layer + a new pure endpoint module (chosen over static SVG assets / default tinted pins) |

## Components

### New: `js/route-endpoints.js` (pure, TDD)

- `routeEndpoints(geometry, { loopThresholdM = 100 } = {})` →
  `{ start: [lon, lat], end: [lon, lat], isLoop }` or **`null`** when geometry is
  missing/invalid (not a LineString, < 2 coordinates).
  - Geometry is always a GeoJSON **LineString** (enforced by `js/admin/validate.js`),
    coordinates `[lon, lat]`; start = first coordinate, end = last.
  - `isLoop` = haversine(start, end) ≤ `loopThresholdM`.
  - Haversine is **imported from `js/stats.js`** — export the existing private
    `haversineMeters` there; do not duplicate it.
- `parkingSearchUrl([lon, lat])` → `https://www.google.com/maps/search/parking/@{lat},{lon},15z`
  - The viewport-anchored form reliably searches "parking" *at the trailhead*; the
    documented `?api=1&query=parking near …` form geocodes unreliably in remote areas.
  - Watch the **lat/lon order swap**: GeoJSON is `[lon, lat]`, the URL wants `lat,lon`.

### Changed: `js/route-layer.js` (Leaflet glue, manual-verify)

`routeLayer(geometry, status, opts = {})` — existing casing + dashed line unchanged;
appends endpoint markers to the returned feature group:

- Markers are `L.marker` with `L.divIcon` containing **inline SVG flags**:
  - Start: green flag (`#2e7d32`), triangular pennant.
  - End: checkered finish flag (slate `#37474f` + white).
  - Loop (`isLoop`): **one combined marker** — checkered flag on a green pole.
  - All flags have a **white casing/outline** (same strategy as the route line) so they
    read on both light and dark tiles. Fixed colors in both themes.
  - `iconAnchor` at the **pole base** so the flag stays planted on the endpoint at
    every zoom level. Size constant across zooms (standard divIcon behavior).
- Each marker gets a Leaflet **tooltip**; texts come from `opts.labels`
  (`{ start, end, startEnd }`), defaulting to English (`"Start"`, `"End"`,
  `"Start & finish"`) — so the **admin preview gets markers with zero changes**.
- `routeEndpoints()` returning `null` → no markers; the layer renders exactly as today.

### Changed: `js/trails.js` (glue, manual-verify)

- `drawRoute()` passes i18n'd tooltip labels into `routeLayer()`.
- The `tt:langchange` handler **also redraws the route** when a hike is selected, so
  marker tooltips switch language (detail panel already re-renders).
- `openDetail()` adds a **parking link row** below the stats block, separated by the
  existing divider style:
  - Label: EN **"Parking near trailhead"**, SK **"Parkovanie pri štarte"**
    (new `DICT` keys in `js/i18n.js`).
  - `href` = `parkingSearchUrl(start)`, `target="_blank"`, `rel="noopener"`.
  - Rendered **only when the hike has valid geometry** (endpoints resolvable).

### Changed: `js/admin/ui.js`

- `errorText`: "founder account" → "owner account". Nothing else.

## Edge cases

- **No geometry yet** (hike created before GPX upload): no markers, no parking link;
  nothing breaks.
- **Degenerate geometry** (< 2 points): `routeEndpoints()` → `null` → same as today.
- **Track direction:** first GPX point = start, as recorded. A backwards-recorded
  track is fixed by re-uploading the GPX, not by code.

## Testing

- **TDD (`node --test`)** for `js/route-endpoints.js`: endpoint extraction; loop
  detection at/around the 100 m threshold (just under, just over); null on
  missing/invalid/short geometry; `parkingSearchUrl` formatting incl. the lat/lon swap.
- **Manual checklist** (Leaflet/DOM glue, per project convention — hard-refresh
  Ctrl+Shift+R when verifying locally):
  - Point-to-point hike: green start flag + checkered end flag.
  - Loop hike (e.g. the lakeside loop): single combined flag.
  - Parking link opens Google Maps with a parking search at the trailhead.
  - Dark mode: flags legible on dark tiles.
  - Language switch: tooltips + link label flip EN⇄SK.
  - Admin map preview shows the same flags.
  - Admin non-owner error says "owner account".

## Out of scope

- Marker popups (placement decision went to the detail panel).
- Freemium / guest messaging, F UI-redesign checkpoint — separate future increments.
- Any geometry editing or re-routing (GPX remains the source of truth).
