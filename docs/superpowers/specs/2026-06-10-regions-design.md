# TatraTrails — Regions (Increment C) — Design Spec

**Date:** 2026-06-10
**Status:** Design approved in brainstorming; ready for implementation planning.
**Builds on:** Increment B (list overhaul — shipped). Hikes group into collapsible distance bands
(`js/bands.js`) with a name-search autocomplete; every prepared hike carries `distance_m`
(stored or geometry fallback) plus `ascent_m`/`duration_min`. GPX upload in the admin already
auto-fills geometry, distance, ascent and an estimated duration.

> **Roadmap context.** Four-increment roadmap: A) hike stats ✅ → B) list overhaul ✅ →
> **C) regions (this spec)** → D) visibility (private "see-everything" site + hard enforcement).
> This spec covers **Increment C only**.

---

## 1. Purpose

Broaden TatraTrails from a High-Tatras-only board into a **Slovakia-wide** trail-conditions board,
organized by **mountain range**. The public list gains an outer grouping level so a growing,
multi-region catalogue stays navigable by place.

New list hierarchy: **Region → distance band → hike**, both levels collapsible, all collapsed by
default.

---

## 2. Scope

**In scope:**
- A `regions` table (geomorphological *celok* level) and a `hike_regions` **many-to-many** join.
- Prepopulate the **full** Slovak geomorphological taxonomy (every *celok*, incl. basins/plains).
- Public list grouped **Region → band → hike**, regions ordered **east→west automatically** from a
  stored longitude. A region renders only when **public *and* non-empty**.
- A hike may belong to **several** regions and **appears under each** (in the list and counts).
- Admin: a **multi-select** region picker on the hike editor (≥1 required); **GPX auto-suggest** of
  the region set; a per-region **public/private toggle**.
- A new pure module `js/region-geo.js` for the geometry→region suggestion.
- Public **list and search** operate only on **public-visible** hikes (display-level filtering).

**Out of scope (later / YAGNI):**
- The separate **private "see-everything" site** for the owner/friends → Increment D.
- **Auth for friends** / any per-user access model → Increment D.
- **Hard server-side enforcement** of public/private (RLS that withholds private rows from the anon
  key) → Increment D. In C, hiding is **display-level** only.
- A full in-app "add / rename / reorder region" manager — the taxonomy is seeded; no CRUD UI.
- **Point-in-polygon** region detection (no boundary polygons are stored).
- Any change to map behaviour, the detail panel, or the distance-band definitions.

---

## 3. Data model

### 3.1 `regions` (new table)

| column | type | notes |
|---|---|---|
| `id` | bigint generated always as identity, PK | |
| `slug` | text unique not null | e.g. `vysoke-tatry` |
| `name_en` | text not null | mirrors `name_sk` where no English exonym exists (e.g. "Volovské vrchy") |
| `name_sk` | text not null | |
| `kraj` | text, nullable | informational only; nullable because ranges can span several *kraje* |
| `centroid_lon` | double precision, nullable | representative longitude; drives east→west ordering |
| `centroid_lat` | double precision, nullable | representative latitude; captured now, unused in C (future map use) |
| `is_public` | boolean not null default **false** | curate-in: a region is hidden publicly until explicitly published |
| `created_at` / `updated_at` | timestamptz not null default now() | |

### 3.2 `hike_regions` (new join table — M:N)

| column | type | notes |
|---|---|---|
| `hike_id` | bigint not null references `hikes(id)` on delete cascade | |
| `region_id` | bigint not null references `regions(id)` on delete cascade | |
| primary key | `(hike_id, region_id)` | |

Index `hike_regions_region_id_idx` on `(region_id)` for the region→hikes lookup.

A hike is required (in the admin editor) to have **≥1** membership. The `hikes` table is otherwise
unchanged — there is **no** `region_id` column; membership lives entirely in the join.

### 3.3 RLS

Mirror the existing `hikes`/`closures` policies — **`public read` (using true) + `admin write` (to
authenticated)** — on both `regions` and `hike_regions`. C does **not** add an `is_public`-based RLS
filter; that withholding is Increment D. (Consequence: private rows are still fetchable via the raw
anon API in C; they are simply never rendered. The content is non-sensitive public trail data.)

---

## 4. Ordering & visibility semantics

**Ordering (automatic, no manual numbering):** regions sort by `centroid_lon` **DESC** (in Slovakia
more-east = higher longitude, so descending longitude = east→west), tiebreak `name_sk` ascending. A
region added later slots into place from its longitude alone. A region with a null `centroid_lon`
sorts last.

**Public-visible hike:** a hike that belongs to **≥1 public region**. This single filtered set is the
input to **both** the list renderer and the search index, so search structurally cannot surface a
non-public hike.

**A region renders publicly iff:** `is_public = true` **and** it has ≥1 public-visible hike. Empty or
private regions are omitted entirely (no empty `<details>`).

**Multi-region hikes:** a hike belonging to several public regions **renders under each**, and is
counted in each region's (and each band's) header count. A hike whose regions are *all* private — or
which has **no** regions — does not appear publicly (and is flagged in the admin so it can be fixed).

---

## 5. Public list rendering (`js/trails.js`)

`renderList` gains an outer region grouping:

1. Build the **public-visible** hike set (≥1 public region).
2. For each **public, non-empty** region in east→west order, render a **`<details class="region-group"
   data-region="<slug>">`** (no `open` → collapsed) whose `<summary>` shows the region name (current
   language) + its hike count.
3. Inside each region, render the existing **distance-band** `<details>` groups (collapsed), and
   inside each band the existing `.hike-row` rows (name + status badge + stat line), each tagged
   `data-slug`. A hike that is in this region renders here; the same hike may also render in another
   region group.

**Selection** (`select(slug)`, shared by row tap and search): clear prior `.selected`; mark the chosen
row, `scrollIntoView`; **open its band `<details>` and its enclosing region `<details>`**; (existing)
draw route + open detail. The hike is selected in the **first (easternmost)** region it belongs to.
`renderList` re-applies the selected hike's expanded region+band + highlight after a language/unit
re-render, so context survives toggles.

Counts and labels update for free via the existing `tt:langchange` / `tt:unitchange` re-render.

---

## 6. Name search

The existing `js/search.js` (`normalizeText`, `searchHikes`) is unchanged. The only change is that its
input is the **public-visible** hike set (§4), so non-public hikes never appear as suggestions. A hike
is shown **once** in the dropdown (by slug) regardless of how many regions it belongs to; selecting it
runs the shared `select(slug)` (expanding its first region + band).

---

## 7. Admin (`admin.html` / `js/admin/*`)

### 7.1 Region multi-select on the hike editor
- A **type-to-filter multi-select** listing all regions (east→west, current-language label). **≥1
  required** to save.
- Editing an existing hike loads its current memberships; **save diffs** `hike_regions` (insert added,
  delete removed) for that hike.
- Regions are fetched once (with `id, slug, name_en, name_sk, centroid_lon, centroid_lat, is_public`)
  and reused for the picker and the GPX suggestion.

### 7.2 GPX auto-suggest (extends `onGpxChange`)
After geometry/stat prefill, compute the suggested region set and **pre-check** it in the multi-select,
keeping the existing "auto-filled from GPX — edit if needed" hint:
- `suggestRegions(coords, regions)` (see §8): take the track's **start, midpoint, and end** points,
  map each to its **nearest region centroid**, and union the distinct region ids.
- This is a **suggestion** — the founder confirms/adjusts. It naturally yields one region for a route
  that stays in a range, and a set for a traverse; the midpoint catches a loop that bulges into a
  neighbour. Tight clusters of small ranges may over-suggest (untick extras) or, for mid-route
  excursions not near a sampled point, under-suggest (add manually).

### 7.3 Visibility toggle
A small admin section lists **populated** regions (those with ≥1 hike), each with a **public/private
toggle** writing `regions.is_public`. (Empty regions need no toggle — they never render regardless.)

---

## 8. New pure module `js/region-geo.js`

Pure, DOM-free, unit-tested (matches the `bands.js` / `search.js` pattern):
- `representativePoints(coords)` → up to three `[lon,lat]` points: first, middle, last (deduped; a
  loop where first≈last still yields the midpoint).
- `nearestRegion(point, regions)` → the `region` whose `(centroid_lon, centroid_lat)` is closest to
  `point` (equirectangular/great-circle approximation; regions lacking a centroid are ignored). Null
  if no region has a centroid.
- `suggestRegions(coords, regions)` → ordered, de-duplicated array of region ids from
  `representativePoints` → `nearestRegion`. Empty when `coords` has <1 usable point or no region has a
  centroid.

---

## 9. Seed / reference data

Prepopulate the **complete Slovak geomorphological division at the *celok* level** (mountain ranges,
highlands, basins and plains alike — every unit). Each seeded row:
`slug, name_en (= name_sk where no English exonym), name_sk, kraj (primary, nullable), centroid_lon,
centroid_lat, is_public`.

- `is_public` defaults **false**; seed **Vysoké Tatry = true** so today's content keeps showing on
  deploy.
- Migrate the existing seed hikes by inserting a `hike_regions` row linking each to **Vysoké Tatry**.
- **Compiling this list is a discrete implementation step.** It must be sourced accurately (≈80–100
  units with bilingual names, primary *kraj*, and a representative lon/lat) via a research pass against
  the geomorphological division — **not** hand-typed from memory.

---

## 10. Error handling & edge cases

- **Hike with 0 regions** or **all-private regions** → not public-visible → hidden from the public list
  and search; visible/flagged in admin so it can be fixed.
- **Empty region** (no public-visible hikes) or **private region** → omitted from the list.
- **Region with null `centroid_lon`** → sorts last (after all positioned regions); ignored by
  `nearestRegion`.
- **GPX with <2 points** → existing geometry error path; region suggestion simply yields nothing and
  the picker is left for manual selection.
- **Save with 0 regions selected** → blocked in the admin editor (≥1 required), consistent with other
  required-field validation.
- **Diacritics / no English name** → `name_en` mirrors `name_sk`; search normalization already strips
  diacritics.

---

## 11. Testing

**Unit (`node:test`):**
- `tests/region-geo.test.js` — `representativePoints` (≥2-point line → 3 points; loop first≈last still
  returns the midpoint; <2 points → degenerate handling); `nearestRegion` (picks closest centroid;
  ignores centroid-less regions; null when none have centroids); `suggestRegions` (single region for an
  in-range track; two for a traverse; de-dupes; empty input → `[]`).
- Region **ordering** helper — `centroid_lon` DESC with `name_sk` tiebreak; null centroid sorts last.
- **Public-dataset filter** — a hike with no region and a hike whose regions are all private are
  excluded; a hike in ≥1 public region is included and yields one entry per public region it belongs to.
- **Search exclusion** — searching the filtered set never returns a non-public hike.

**Manual verification:**
- Public list: two-level collapse (region → band → hikes), all collapsed; region headers show name +
  count; a multi-region hike appears under each of its public regions; east→west region order; empty
  and private regions absent.
- Selection from a row and from search expands the region **and** band and highlights the row; survives
  language/unit toggles.
- Admin: region multi-select (type-to-filter, ≥1 required, diffed on save); GPX upload pre-checks the
  suggested set alongside the stat prefill; the public/private toggle hides/shows a populated region on
  the public board.

---

## 12. Code structure

**New:**
- `db/schema.sql` (or a migration) — `regions`, `hike_regions`, indexes, RLS policies.
- `db/seed.sql` — the full geomorphological taxonomy + `hike_regions` migration for existing hikes.
- `js/region-geo.js` — `representativePoints`, `nearestRegion`, `suggestRegions`.
- `tests/region-geo.test.js`.

**Modified:**
- `js/data.js` — fetch regions + each hike's region memberships (extend the PostgREST select).
- `js/trails.js` — region grouping in `renderList`; the public-visible filter feeding list + search;
  `select` expanding region + band.
- `js/admin/ui.js` — region multi-select, save-diff of `hike_regions`, GPX auto-suggest wiring,
  visibility-toggle section.
- `js/admin/store.js` — read/write `regions` + `hike_regions`.
- `js/i18n.js` — UI label keys (e.g. "Region", picker/section labels). Region *names* are data, not
  dictionary keys.
- `css/styles.css` — `.region-group` summary styling; admin multi-select + toggle styling.

---

## 13. Deferred to implementation planning

1. Exact PostgREST select shape for nested region memberships (embedded resource vs. separate fetch +
   client join).
2. The geomorphological seed list itself (the research pass output) and its `kraj`/centroid values.
3. `nearestRegion` distance metric detail (equirectangular vs. haversine — equirectangular is ample at
   this scale).
4. Multi-select widget specifics (native vs. lightweight custom; the type-to-filter behaviour) and its
   CSS, staying dependency-free on the admin page.
5. `.region-group` summary visual treatment and the nested-`<details>` indentation.
