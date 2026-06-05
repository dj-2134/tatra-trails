# TatraTrails — Trail Open/Closed Overlay — Design Spec

**Date:** 2026-06-05
**Status:** Design approved in brainstorming; ready for implementation planning.
**Increment:** 2 (builds on Increment 1 — the map foundation)

---

## 1. Purpose

Deliver the core promise in the README — *"which trails are open or closed right now"* —
by rendering a curated set of High Tatras trails on the existing map, color-coded by their
**current** status, and letting a user tap a trail to see *why* it's closed and until when.

Increment 1 already provides the map shell (Leaflet + Mapy tiles, EN/SK i18n, light/dark
theme, floating layout, an Open/Closed legend, and the `node --test` pure-module pattern).
This increment fills the empty promise behind the legend.

---

## 2. What drives a trail's status

A trail's status reflects **both**, layered:

1. **Seasonal closures (computed baseline).** TANAP's annual closure of specific marked
   sections. Predictable and date-driven, so status is computed from a static, version-
   controlled dataset against today's date — near-zero maintenance, accurate for the
   predictable case.
2. **Ad-hoc closures (hand-maintained overlay).** Temporary closures (weather, rockfall,
   fallen trees, bear activity, maintenance). Edited as a small data file and redeployed.

The data model carries both from day one. Ad-hoc entries start as a hand-maintained list;
automating their collection is a later upgrade (see §10).

---

## 3. Scope

**Coverage:** a **curated set of key routes** (~8–15 to start: Tatranská magistrála sections,
main peak and valley trails), geometry extracted **once** from OpenStreetMap and committed as
versioned GeoJSON, each tagged with its closure rule. Expand the set over time. *Not* every
minor path; *not* a bulk OSM import.

**Granularity:** **whole-route + note.** One status per route, plus a free-text `note` field
to carry nuance (e.g. *"upper section above Zbojnícka chata closed"*). No segment splitting in
this increment.

**Status values:** `open` | `closed` | `partial`. The third state (`partial`) lets a
part-closed route render honestly (amber) instead of masquerading as fully open or closed.

**Explicitly out of scope (YAGNI):** search box (stays disabled), Popular hikes, Plan a route,
all-OSM bulk import, segment-level splitting, automated closure scraping/aggregation
(the §10 upgrade), crowdsourcing, PWA/offline, user accounts, difficulty/length metadata
(the model stays forward-compatible but these are unpopulated).

---

## 4. Architecture & data flow

Two committed data files + two small JS modules, all static, deployed as-is to GitHub Pages.

```
data/
  trails.geojson     route geometry + seasonal rules + metadata   (stable; rarely edited)
  closures.json      ad-hoc closures keyed by trail id            (volatile; edited weekly)
js/
  status.js          PURE: (seasonal, adhoc, today) -> status      (unit-tested)
  trails.js          loads + merges the two files, computes status via status.js,
                     adds a styled Leaflet GeoJSON layer, wires tap -> detail panel
```

**Flow:** `main.js` calls into `trails.js` → it fetches both files → for each route, a pure
`prepareFeatures(trails, closures, today)` step computes status via `status.js` → Leaflet
renders each route colored by status → tapping a route opens its detail in the existing side
panel.

**Why two files:** geometry barely changes, but ad-hoc closures are touched often. Separating
them keeps volatile edits out of the large GeoJSON (clean diffs, low risk, fast
"edit `closures.json` → push → live in seconds").

**Status is computed in the browser against today's date** — so "right now" is genuinely live
and never goes stale between deploys.

---

## 5. Data model

### 5.1 `trails.geojson` — one Feature per curated route

```jsonc
{
  "type": "Feature",
  "geometry": { "type": "LineString", "coordinates": [ /* lon,lat pairs from OSM */ ] },
  "properties": {
    "id": "magistrala-hrebienok-zbojnicka",       // stable slug; joins to closures.json
    "name": { "en": "...", "sk": "..." },
    "seasonal": { "from": "11-01", "to": "06-15", "partial": false }, // MM-DD; null = none
    "note":   { "en": "", "sk": "" },              // optional standing nuance
    "ref": "https://www.tanap.sk/..."              // optional source/info link
  }
}
```

- `seasonal` is `null` for routes with no seasonal closure.
- `seasonal.from`/`to` are `MM-DD` (the date varies per section; see §9).
- `seasonal.partial: true` means the seasonal closure affects only part of the route.

### 5.2 `closures.json` — ad-hoc closures keyed by trail id

```jsonc
{
  "magistrala-hrebienok-zbojnicka": [
    {
      "from": "2026-06-01",                         // ISO date, inclusive
      "to": "2026-06-10",                           // ISO date, inclusive; null = until further notice
      "partial": false,
      "reason": { "en": "Rockfall", "sk": "Zosuv kameňov" },
      "source": "https://www.facebook.com/..."      // where it was reported
    }
  ]
}
```

A trail with no entry (or an empty array) has no ad-hoc closure.

---

## 6. Status logic (`status.js`, pure, no DOM)

`computeStatus(seasonal, adhocList, today)` returns `{ status, activeClosures }`.

1. **Seasonal active?** `today`'s `MM-DD` falls within `[from, to]`, **handling year-wrap.**
   When `from > to` (e.g. `11-01 → 06-15`, which spans New Year), the window is active if
   `today >= from OR today <= to`.
2. **Ad-hoc active?** `today` (full ISO date) falls within `[from, to]`; `to: null` = ongoing.
3. **Resolve precedence:**
   - any active **full** closure (seasonal or ad-hoc) → `closed`
   - else any active **partial** closure → `partial`
   - else → `open`
4. Return the active closures so the detail panel can show reason + dates.

**"Today" is computed in `Europe/Bratislava` local time**, so status flips at Tatra-local
midnight — a tourist in another timezone still sees correct local status.

**Boundary cases the unit tests must cover:** Oct 31 (open) → Nov 1 (closed) → Jan 15 (closed)
→ Jun 15 (closed) → Jun 16 (open); ad-hoc full vs partial; ongoing (`to:null`); ad-hoc
overriding a seasonally-open trail; precedence (full > partial > open); no rules → open.

---

## 7. Rendering, interaction & i18n

**Trail styling — CSS-driven, not JS.** Each Leaflet path gets a `className` of
`trail trail--open | trail--closed | trail--partial`. Colors come from theme CSS variables
(`--open`, `--closed`, and a new `--partial` amber), so **light/dark theming recolors trails
for free on toggle — no JS restyle.** Solid polylines (~4px), emphasized stroke on hover and
when selected.

**Legend.** Add a third item — *Partially closed* (amber swatch). New i18n key `legend.partial`.

**Tap a trail → detail in the side panel.** Selecting a route swaps the panel (currently the
*Popular hikes* / *Plan a route* placeholders) into a trail-detail view showing:
- localized route name + a status badge (Open / Closed / Partially closed)
- for each active closure: reason + date range (e.g. *"Closed Jun 1 – ongoing · Rockfall"*) and a source link
- the standing `note` if present
- the safety disclaimer (§8)
- a close/back control returning the panel to its default state

**i18n.** Trail names/notes/reasons live in the data as `{en, sk}` and render in the active
language. UI chrome (status words, "Source", "Closed since", disclaimer) lives in `DICT`.
Because the detail panel is dynamic (not static `[data-i18n]` DOM), `trails.js` subscribes to a
small **language-change hook** so an open panel re-renders on EN/SK toggle. (Theme needs no
hook — CSS handles it.)

---

## 8. Error handling, edge cases & safety

**Fail safe — never break the map:**
- `trails.geojson` fails to load → base map stays usable; a quiet notice says trail data is unavailable.
- `closures.json` fails → **fall back to seasonal-only** (geometry still renders with computed seasonal status) + a subtle "live closures unavailable" note.
- Malformed feature / missing geometry / closure referencing an unknown trail id → skipped gracefully.

**Safety & trust (non-negotiable):** a prominent, persistent disclaimer —
*"Awareness only. Always verify with TANAP / mountain rescue (HZS) before you go; the absence
of a closure here is not a guarantee a trail is open or safe."* Every closure shows its source
and dates.

---

## 9. Testing

Follows the existing `node --test` pure-module pattern.

- **`status.js` unit tests** — all cases in §6, especially the year-wrap boundaries.
- **Data-validation test (CI guardrail, safety-critical):** every `closures.json` key exists
  in `trails.geojson`; every feature has `id` / `name` / `geometry`; all dates well-formed;
  `seasonal.from`/`to` valid `MM-DD`. **Bad data fails the build** rather than shipping a wrong
  "open."
- Keep the merge/compute as a pure `prepareFeatures(trails, closures, today)` function
  (testable); only the thin Leaflet binding stays untested.

---

## 10. Data sourcing

- **Geometry:** OpenStreetMap (© OpenStreetMap contributors, ODbL — attribution required),
  extracted once per curated route into `trails.geojson`.
- **Seasonal windows:** TANAP's official *Návštevný poriadok* and the published list of closed
  sections on **tanap.sk**. Dates **vary per section** — this is why each feature carries its
  own `seasonal` window:
  - Most marked trails: **1 November – 15 June** (the rule text cites 1 Nov – 31 May for the
    majority; ~15 June is the widely-published reopening).
  - Specific sections differ — e.g. **Symbolický cintorín pod Ostrvou** (yellow): **1 Jan – 15 Jun**.
- The exact per-trail dates for the starting curated set are filled in during implementation
  from the official source.

---

## 11. Future upgrade (Approach C — later, not now)

When ad-hoc closures get heavy enough to warrant automation, `trails.js` swaps its
`fetch('closures.json')` for `fetch('/api/closures')` served by a small endpoint — potentially
fed by the bear-app aggregation engine. Nothing else in the client changes. The static MVP is
intentionally the starting point.

---

## 12. Deferred to implementation planning

1. The exact starting curated route list (which ~8–15 routes) + their OSM extraction.
2. Exact per-section seasonal dates from TANAP for those routes.
3. Detail-panel layout specifics (and mobile behavior of the side panel).
4. The precise shape of the language-change hook between `ui.js` and `trails.js`.
