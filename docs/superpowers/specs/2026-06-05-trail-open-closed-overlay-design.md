# TatraTrails — Trail Open/Closed Overlay (backend-based) — Design Spec

**Date:** 2026-06-05
**Status:** Design approved in brainstorming; ready for implementation planning.
**Increment:** 2 (builds on Increment 1 — the map foundation)

> **Revision note:** This increment was originally scoped as static files
> (`trails.geojson` + `closures.json`). During brainstorming it was promoted to a
> **backend + API + admin UI** so the founder can edit hikes/closures from anywhere and
> so the future auto-aggregation engine has a database to write into. The status model and
> the public UX are unchanged; the data now lives in Supabase instead of static files.

---

## 1. Purpose

Deliver the README promise — *"which trails are open or closed right now"* — through a
**Popular hikes** list that is itself the conditions board: each curated hike shows a live
**Open / Closed / Partial** badge, and selecting one draws and zooms to its route on the map
(status-colored) with the detail of *why* it's closed and until when.

The map stays **clean by default**; routes appear on demand, one at a time, so the view stays
readable no matter how many hikes we curate (shared sections never pile up).

Increment 1 already provides the map shell (Leaflet + Mapy tiles, EN/SK i18n, light/dark
theme, floating layout, an Open/Closed legend, the `node --test` pure-module pattern, and a
GitHub Pages deploy). This increment fills the empty promise behind the legend and moves the
data onto a small, free backend with an admin UI.

---

## 2. What drives a hike's status

A hike's status reflects **both**, layered (unchanged from the static design):

1. **Seasonal closures (computed baseline).** TANAP's annual closure of specific marked
   sections — predictable, date-driven, computed against today's date. Near-zero maintenance;
   accurate for the predictable majority of "closed" states.
2. **Ad-hoc closures (admin-maintained overlay).** Temporary closures (weather, rockfall,
   fallen trees, bear activity, maintenance), entered through the admin UI. Low-volume and
   mostly sourced from official TANAP / mountain-rescue (HZS) announcements.

Automated *discovery* of ad-hoc closures is still a later upgrade (§11) — but now it writes
into the same database rather than being bolted on.

---

## 3. Scope

**Coverage:** **as many distinct popular hikes as we can curate** — named, recognizable High
Tatras routes (Tatranská magistrála sections, main peak and valley trails), sourced from public
hike lists (§10) with geometry imported from OpenStreetMap/GPX. Start with a first batch and
expand. Because only the *selected* route is ever drawn (§6), hikes may share physical sections
without visual overlap, so coverage isn't constrained by overlap.

**Granularity:** **whole-route + note.** One status per hike, plus a free-text note for nuance
(e.g. *"upper section above Zbojnícka chata closed"*). No segment splitting this increment.

**Status values:** `open` | `closed` | `partial` (amber). The third state lets a part-closed
hike render honestly instead of masquerading as fully open or closed.

**In scope:** the Supabase backend (schema, RLS, Auth), the public read path, the Popular-hikes
conditions board + route-on-select, and an admin path (Supabase dashboard for v1, a thin custom
form as a fast-follow).

**Out of scope (YAGNI):** search box (stays disabled), Plan a route, crowdsourcing, PWA/offline,
hiker accounts, automated closure discovery (the §11 engine), in-browser geometry drawing
(geometry is imported), and difficulty/length metadata (schema stays forward-compatible).

---

## 4. Architecture

**Stack:** **Supabase (free tier)** + the existing **GitHub Pages** frontend. Supabase provides
Postgres, an auto-generated REST API (PostgREST), Auth, and a built-in admin dashboard — so most
of this is configuration, not bespoke code.

```
GitHub Pages (static frontend, free)
  index.html, css/, js/
    status.js        PURE: (seasonal, adhoc, today) -> status        (unit-tested)
    data.js          fetches hikes(+nested closures) from the Supabase REST API (read-only key)
    trails.js        prepareHikes() computes status; renders the Popular hikes list (badges);
                     on select -> draws that ONE route + fits map + shows detail
    admin/ (fast-follow)  thin authenticated form page for editing hikes/closures

Supabase (free tier)
  Postgres  ->  tables: hikes, closures   (geometry stored as GeoJSON JSONB)
  PostgREST ->  auto REST API; public anon key is READ-ONLY via Row-Level Security
  Auth      ->  email magic-link for the founder; only the admin can write
  Dashboard ->  built-in table editor = the v1 admin UI (edit from any browser)

GitHub Actions (free)
  daily cron ping to the REST API -> keeps the free Supabase project from pausing
```

**Public flow:** frontend `fetch`es `hikes` with their nested `closures` in **one** PostgREST
request (FK-embedded select) using the public anon key → `prepareHikes(rows, today)` computes
each hike's status via `status.js` → the Popular-hikes list renders with live badges → selecting
a hike draws its single route (status-colored), fits the map to it, and opens its detail.

**Why a backend now:** the founder gets an edit-from-anywhere UI without git; data is structured
and validated by the DB; and the same `closures` table is exactly where the §11 auto-aggregation
engine later inserts rows — so this is the automation foundation, not a detour.

**No PostGIS required this increment.** We do no spatial queries (status is by date; fit-bounds
is client-side), so geometry is stored as **GeoJSON in a JSONB column** and returned directly by
the API. PostGIS can be enabled later for "near me" features.

---

## 5. Data model (DB schema)

### `hikes`
| column | type | notes |
|---|---|---|
| `id` | bigint identity PK | |
| `slug` | text unique | stable human id (e.g. `magistrala-hrebienok-zbojnicka`) |
| `name_en`, `name_sk` | text | |
| `geometry` | jsonb | GeoJSON `LineString`/`MultiLineString` (lon,lat) imported from OSM/GPX |
| `seasonal_from`, `seasonal_to` | text `MM-DD`, nullable | both null = no seasonal closure |
| `seasonal_partial` | boolean default false | seasonal closure affects only part of the route |
| `note_en`, `note_sk` | text, nullable | standing nuance |
| `ref` | text, nullable | source/info link |
| `created_at`, `updated_at` | timestamptz | |

### `closures`
| column | type | notes |
|---|---|---|
| `id` | bigint identity PK | |
| `hike_id` | bigint FK → `hikes.id` on delete cascade | |
| `from_date` | date | inclusive (`from`/`to` are reserved → `*_date`) |
| `to_date` | date, nullable | inclusive; null = until further notice |
| `partial` | boolean default false | |
| `reason_en`, `reason_sk` | text | |
| `source` | text, nullable | where it was reported |
| `created_at` | timestamptz | |

**DB-level validation (the safety guardrail moves into the DB):** `NOT NULL` on required
fields, the FK, and `CHECK` constraints on `seasonal_from`/`seasonal_to` matching `^\d\d-\d\d$`
and `to_date >= from_date`. Bad data can't be inserted in the first place.

---

## 6. Status logic & rendering

### `status.js` (pure, no DOM — unchanged from the static design)
`computeStatus(seasonal, adhocList, today)` → `{ status, activeClosures }`:
1. **Seasonal active?** today's `MM-DD` is within `[from, to]`, **handling year-wrap**: when
   `from > to` (e.g. `11-01 → 06-15`, spanning New Year), active if `today >= from OR today <= to`.
2. **Ad-hoc active?** today's date is within `[from_date, to_date]`; `to_date: null` = ongoing.
3. **Resolve precedence:** any active **full** closure → `closed`; else any active **partial** →
   `partial`; else → `open`. Returns the active closures for the detail panel.

**"Today" is `Europe/Bratislava`** local time, so status flips at Tatra-local midnight.
**Unit-tested boundaries:** Oct 31 → Nov 1 → Jan 15 → Jun 15 → Jun 16; ad-hoc full vs partial;
ongoing (`null`); ad-hoc overriding a seasonally-open hike; precedence; no rules → open.

### Rendering & interaction (unchanged UX)
- **Popular hikes list = the board:** one row per hike, localized name + live status badge.
- **Select → draw + zoom + detail:** draws that one route, fits bounds, shows status badge,
  each active closure (reason + dates + source link), the standing note, and the disclaimer;
  a deselect control clears the route and returns to the clean map. Selecting another hike
  clears the previous route — only one drawn at a time.
- **CSS-driven colors:** the route path and list badges use `trail--open|closed|partial`
  classes bound to theme CSS vars (`--open`, `--closed`, new `--partial` amber) → light/dark
  recolors for free.
- **Legend:** add *Partially closed* (amber). New i18n key `legend.partial`.
- **i18n:** hike names/notes/reasons come from the data as `*_en`/`*_sk`; UI chrome lives in
  `DICT`. `trails.js` subscribes to a language-change hook so the dynamic list/detail re-render
  on EN/SK toggle. (Theme is pure CSS — no hook.)

---

## 7. Admin & auth

- **Auth:** Supabase **email magic-link**, for the founder only. **Row-Level Security:** the
  public anon role can `SELECT` only; `INSERT/UPDATE/DELETE` are restricted to the authenticated
  admin.
- **v1 admin = the Supabase dashboard** Table Editor — forms for `hikes`/`closures` rows, usable
  from any browser anywhere, **zero build**. Good enough to operate day one.
- **Fast-follow custom admin** (small static page behind Supabase Auth): a friendlier form —
  hike dropdown, date pickers, EN/SK fields, partial toggle, source — for quick closure entry.
- **GPX upload → geometry (Phase 2):** the admin page accepts a **`.gpx` file**, parses its track
  to a GeoJSON `LineString` in-browser, and writes it to the selected hike's `geometry` column
  (authenticated). This is how the founder **fixes/refines route shapes to 100%** without SQL —
  the chosen path now that routing is only an approximation (see §10). Replaces the manual
  OSM/BRouter step for accuracy.
- **Geometry sourcing:** new/rough routes can still be seeded via OSM/BRouter
  (`scripts/build-geometry.mjs`), but accurate geometry comes from GPX through the admin upload.

---

## 8. Hosting, cost, security & error handling

**Cost: €0** at this scale (Supabase free + Pages + Actions). Free Supabase projects pause after
~7 days idle → a **daily GitHub Actions cron** pings a tiny REST endpoint to keep it warm. No
paid tier required. *(Verify current free-tier limits during planning.)*

**Security:**
- The **anon key is public-safe** (read-only via RLS) and may ship in the frontend.
- The **service-role key never** touches the browser or the repo — only admin scripts use it via
  a secret/env var.
- No hiker personal data is collected this increment (no public accounts), so no new GDPR surface
  beyond the admin's own login.

**Fail safe — never break the map:**
- API/network failure → base map stays usable; a quiet "trail data unavailable" notice.
- If closures are fetched separately and fail → **fall back to seasonal-only** (geometry still
  renders with computed seasonal status) + a subtle "live closures unavailable" note.
- Malformed/missing geometry row → skipped gracefully.

**Safety & trust (non-negotiable):** a prominent, persistent disclaimer — *"Awareness only.
Always verify with TANAP / mountain rescue (HZS) before you go; the absence of a closure here is
not a guarantee a trail is open or safe."* Every closure shows its source and dates.

---

## 9. Testing

Follows the existing `node --test` pure-module pattern.
- **`status.js` unit tests** — all §6 cases, especially the year-wrap boundaries (the core logic).
- **`prepareHikes(rows, today)`** kept pure and tested (merge API rows → features + status +
  detail); only the thin Leaflet/DOM binding stays untested.
- **DB constraints** (NOT NULL, FK, CHECK on dates/`MM-DD`) are the first line of data validation;
  a lightweight **API smoke test** confirms the read path returns the expected shape.

---

## 10. Data sourcing

- **Which hikes:** public lists for the district, e.g.
  [Prešov Region travel — Vysoké Tatry hiking](https://presovregion.travel/vylety/?_kategorie_lokalit=turistika&_okres=vysoke-tatry),
  cross-checked against the marked trail network.
- **Geometry:** OpenStreetMap / GPX (© OpenStreetMap contributors, ODbL — attribution required),
  imported once per hike into `hikes.geometry`.
- **Seasonal windows:** TANAP's official *Návštevný poriadok* and the published list of closed
  sections on **tanap.sk**. Dates **vary per section** — hence per-hike windows:
  - Most marked trails: **1 November – 15 June** (rule text cites 1 Nov – 31 May for the majority;
    ~15 June is the widely-published reopening).
  - Specific sections differ — e.g. **Symbolický cintorín pod Ostrvou** (yellow): **1 Jan – 15 Jun**.
- Exact per-hike dates for the starting batch are filled in during implementation.

---

## 11. Future upgrade (still later, now foundationed)

The §11 auto-aggregation path (originally "Approach C") is now half-built: an engine that watches
TANAP/HZS/news for closures simply **inserts rows into the `closures` table** — no frontend or API
change. PostGIS (already available in Supabase) can later power "hikes near me." These remain out
of this increment.

---

## 12. Suggested phasing (for writing-plans)

- **Phase 1 — Public product on the backend:** Supabase project; `hikes`/`closures` schema + RLS
  (read-only anon) + constraints; seed a first batch of hikes (geometry imported); frontend reads
  via the API; Popular-hikes list + status badges + clean-map + route-on-select + partial legend;
  keep-alive cron; `status.js`/`prepareHikes` tests.
- **Phase 2 — Admin & growth:** Supabase Auth + write RLS for the admin; the thin custom admin
  form (hikes + closures); **GPX upload → geometry** so routes can be fixed to 100% from the UI
  (parse `.gpx` → GeoJSON LineString → `hikes.geometry`); expand the hike dataset.

---

## 13. Deferred to implementation planning

1. The exact first batch of hikes (from §10 sources + OSM) and their seasonal dates.
2. `supabase-js` client vs plain `fetch` against PostgREST for the frontend.
3. Custom admin form hosting (`/admin` on Pages vs separate) and its exact fields.
4. Geometry-import tooling specifics (OSM export vs GPX; a small script vs manual).
5. The precise shape of the language-change hook between `ui.js` and `trails.js`.
