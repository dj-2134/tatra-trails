# TatraTrails — List Overhaul (Increment B) — Design Spec

**Date:** 2026-06-08
**Status:** Design approved in brainstorming; ready for implementation planning.
**Builds on:** Increment A (hike stats — shipped). Every prepared hike carries an always-available
`distance_m` (stored value or geometry fallback), plus `ascent_m`/`duration_min`.

> **Roadmap context.** Four-increment roadmap: A) hike stats ✅ → **B) list overhaul (this spec)** →
> C) regions → D) visibility (public/friends/owner). This spec covers **Increment B only**. Regions and
> visibility are explicitly out of scope.

---

## 1. Purpose

Make the public hike list scannable and searchable: group hikes into **distance bands** shown as
**collapsible sections (all collapsed by default)**, and wire the currently-disabled search box into a
**name autocomplete** that jumps to a hike — pre-expanding that hike's band so its category siblings are
there when you return from the detail.

---

## 2. Scope

**In scope:**
- Group the public list (`js/trails.js` `renderList`) into four distance bands, each a collapsible
  `<details>` section, **all collapsed by default**, header = label + range + count.
- A pure `js/bands.js` (banding + range formatting).
- Enable the search box: a pure `js/search.js` (name matching) + an autocomplete dropdown.
- Selecting a hike (search **or** list) expands its band group and highlights its row.

**Out of scope (later / YAGNI):**
- **Regions** and any region-level grouping → Increment C.
- **Visibility / access control** (public/friends/owner) → Increment D.
- Arrow-key navigation within the search dropdown (click + Enter + Escape only).
- Persisting per-group collapse state across visits.
- Any change to the admin UI, the data model, or the detail panel's contents.

---

## 3. Distance bands & grouping

**Bands** (by `distance_m` in meters; thresholds fixed in km regardless of the display-units toggle), with
**half-open boundaries** so every hike lands in exactly one band:

| key | range | meters |
|-----|-------|--------|
| `short` | < 5 km | `[0, 5000)` |
| `moderate` | 5–10 km | `[5000, 10000)` |
| `long` | 10–15 km | `[10000, 15000)` |
| `fullday` | > 15 km | `[15000, ∞)` |

**`js/bands.js`** (pure, unit-tested):
- `BANDS` = ordered `[{ key, minM, maxM }]` (`maxM: null` for `fullday`).
- `bandForDistance(distanceM)` → band key. Defensive: a null/non-finite distance returns `"short"` so a
  hike can never vanish (in practice Increment A guarantees a finite `distance_m`).
- `formatBandRange(band, units)` → range string. Boundaries convert to the active units; metric km
  boundaries are whole numbers, imperial uses 1 decimal:
  - metric: `"< 5 km"`, `"5–10 km"`, `"10–15 km"`, `"> 15 km"`
  - imperial: `"< 3.1 mi"`, `"3.1–6.2 mi"`, `"6.2–9.3 mi"`, `"> 9.3 mi"`

**Rendering** (`renderList`): bucket `HIKES` into bands (preserving existing within-band order), then for each
**non-empty** band in ascending order render a native **`<details class="hike-group" data-band="<key>">`**
(no `open` attribute → collapsed) whose `<summary>` shows `«label» · «range» · «count»` (e.g.
`Short · < 5 km · 3`). Inside, the existing `.hike-row` rows (name + status badge + Increment-A stat line)
render unchanged, each tagged `data-slug`. Empty bands are omitted.

**i18n** band labels (`js/i18n.js` `DICT`):

| key | EN | SK |
|-----|----|----|
| `band.short` | Short | Krátke |
| `band.moderate` | Moderate | Stredné |
| `band.long` | Long | Dlhé |
| `band.fullday` | Full-day | Celodenné |

The existing `tt:langchange` / `tt:unitchange` listeners already re-render the list, so labels (language) and
ranges (units) update for free.

---

## 4. Name search (autocomplete dropdown)

**Enable** the existing `<input id="search">` (remove `disabled`); add a `#search-suggestions` dropdown
container anchored under the search box in the top bar.

**`js/search.js`** (pure, unit-tested):
- `normalizeText(s)` → `String(s||"").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()`.
- `searchHikes(hikes, query)` → hikes whose normalized `name.en` **or** `name.sk` contains the normalized
  query (substring, case- and diacritic-insensitive — so `strbske` matches `Štrbské pleso`). Empty/whitespace
  query → `[]`.

**Interaction** (glue in `js/trails.js`, which holds `HIKES` + `select`):
- On `input`: `matches = searchHikes(HIKES, value)`; show up to **8** suggestions, each = the hike's name
  (current language) + its status badge. Non-empty query with **no matches** → a single muted "No matches"
  line. Empty query → dropdown hidden.
- **Click** a suggestion → `select(slug)` then clear the input + close the dropdown.
- **Enter** → select the top match; **Escape** or click-away → close. (No arrow-key nav.)
- The dropdown is independent of the grouped list (which stays collapsed) — a pure jump-to-hike.

---

## 5. Selection behavior (shared by search & list)

`select(slug)` is extended so picking a hike — from the search dropdown **or** by tapping a row — also
reflects it in the list:
1. Clear any existing `.hike-row.selected`.
2. Mark the chosen `[data-slug]` row `.selected` and `scrollIntoView({ block: "nearest" })`.
3. Open its band group (`row.closest("details.hike-group").open = true`).
4. (Existing) draw the route and open the detail panel.

Because the detail panel replaces the list, the expanded-group + highlight are applied to the
(then-hidden) list and are visible the moment the user taps **← Back**. To keep this consistent across
re-renders, `renderList` re-applies the selected state when `SELECTED` is set (re-opens that group +
re-highlights the row) — so toggling units/language while a hike is selected doesn't lose the context.

---

## 6. Code structure

**New pure modules (unit-tested):**
- `js/bands.js` — `BANDS`, `bandForDistance(distanceM)`, `formatBandRange(band, units)`.
- `js/search.js` — `normalizeText(s)`, `searchHikes(hikes, query)`.

**Modified:**
- `js/i18n.js` — four `band.*` label keys.
- `index.html` — remove `disabled` on `#search`; add the `#search-suggestions` dropdown container.
- `js/trails.js` — `renderList` (band grouping into collapsed `<details>`); `select` (expand band +
  highlight row + scroll); search glue (`#search` → `searchHikes` → dropdown → `select`).
- `css/styles.css` — `.hike-group` / `summary` header styling, `.hike-row.selected` highlight,
  `#search-suggestions` dropdown.

No data-model, admin, RLS, or build changes.

---

## 7. Error handling

- **Empty/whitespace search** → dropdown hidden; **non-empty with no matches** → muted "No matches" line.
- **Diacritics** — names are findable without diacritics (`Štrbské` ↔ `strbske`).
- **A hike with no `distance_m`** (shouldn't occur post-A) → defaults to the `short` band, never dropped.
- **Empty band** → omitted from the list (no empty `<details>`).
- **Re-render on language/unit toggle** rebuilds the list collapsed, but re-applies the `SELECTED` hike's
  expanded-group + highlight so context isn't lost.

---

## 8. Testing

**Unit (`node:test`):**
- `tests/bands.test.js` — `bandForDistance` boundaries (4999→short, 5000→moderate, 9999→moderate,
  10000→long, 15000→fullday, a huge value→fullday, null→short); `formatBandRange` for all four bands in
  **metric** and **imperial**.
- `tests/search.test.js` — `normalizeText` (strips diacritics, lowercases, trims); `searchHikes`
  (substring match, case-insensitive, diacritic-insensitive, matches via `name.en` and via `name.sk`,
  empty/whitespace query → `[]`).

**Manual verification (glue):** the grouped collapsed list (headers show label + range + count; tap to
expand/collapse); the search dropdown (type → up to 8 suggestions; "No matches"; click/Enter/Escape);
selecting from search opens the detail and, on Back, lands in the open band with the hike highlighted;
selecting from the list highlights the row; unit/language toggles update ranges/labels and preserve the
selected hike's context.

---

## 9. Deferred to implementation planning

1. Exact `.hike-group` / `summary` and `#search-suggestions` CSS (reuse `styles.css` vars; the summary
   should look like a tappable header with a disclosure affordance).
2. Dropdown max-items is **8**; "No matches" wording.
3. Suggestion row content = hike name + status badge (no stats, to keep it light).
4. `formatBandRange` numeric formatting detail (metric whole-km integers; imperial 1 decimal).
5. Scroll-into-view behavior tuning (`block: "nearest"`).
