# List Overhaul (Increment B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the public hike list into collapsible distance bands (all collapsed by default) and turn the search box into a name autocomplete that jumps to a hike and opens its band.

**Architecture:** Two new pure, unit-tested modules (`js/bands.js` classification + range; `js/search.js` name matching) drive thin DOM glue in `js/trails.js` (group rendering via native `<details>`, a selection helper, and a search dropdown). Reuses the Increment-A `statParts`/`units()` helpers and the existing `tt:langchange`/`tt:unitchange` re-render listeners.

**Tech Stack:** Plain ES modules (no build step), `node:test`, native `<details>/<summary>`.

**Spec:** `docs/superpowers/specs/2026-06-08-list-overhaul-design.md`

---

## File Structure

**New (pure, unit-tested):**
- `js/bands.js` — `BANDS`, `bandForDistance(distanceM)`, `formatBandRange(band, units)`.
- `js/search.js` — `normalizeText(s)`, `searchHikes(hikes, query)`.

**Modified:**
- `js/i18n.js` — `band.*` labels + `search.noMatches`.
- `index.html` — enable `#search`; add `#search-suggestions`.
- `js/trails.js` — `renderList` (group into `<details>`), `renderRow` (extracted), `select` + `applySelection`, `initSearch` (dropdown).
- `css/styles.css` — `.hike-group`/`summary`, `.hike-row.selected`, `.search-suggestions`/`.search-item`.

No data-model, admin, or RLS changes.

---

## Task 1: `js/bands.js` — distance bands (pure, TDD)

**Files:** Create `js/bands.js`; Test `tests/bands.test.js`.

- [ ] **Step 1: Write the failing test** — create `tests/bands.test.js`:

```js
// tests/bands.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { BANDS, bandForDistance, formatBandRange } from "../js/bands.js";

test("bandForDistance: half-open boundaries", () => {
  assert.equal(bandForDistance(0), "short");
  assert.equal(bandForDistance(4999), "short");
  assert.equal(bandForDistance(5000), "moderate");
  assert.equal(bandForDistance(9999), "moderate");
  assert.equal(bandForDistance(10000), "long");
  assert.equal(bandForDistance(14999), "long");
  assert.equal(bandForDistance(15000), "fullday");
  assert.equal(bandForDistance(99999), "fullday");
});

test("bandForDistance: non-finite/negative falls back to short", () => {
  assert.equal(bandForDistance(null), "short");
  assert.equal(bandForDistance(undefined), "short");
  assert.equal(bandForDistance(-10), "short");
});

const by = (k) => BANDS.find((b) => b.key === k);

test("formatBandRange: metric", () => {
  assert.equal(formatBandRange(by("short"), "metric"), "< 5 km");
  assert.equal(formatBandRange(by("moderate"), "metric"), "5–10 km");
  assert.equal(formatBandRange(by("long"), "metric"), "10–15 km");
  assert.equal(formatBandRange(by("fullday"), "metric"), "> 15 km");
});

test("formatBandRange: imperial", () => {
  assert.equal(formatBandRange(by("short"), "imperial"), "< 3.1 mi");
  assert.equal(formatBandRange(by("moderate"), "imperial"), "3.1–6.2 mi");
  assert.equal(formatBandRange(by("long"), "imperial"), "6.2–9.3 mi");
  assert.equal(formatBandRange(by("fullday"), "imperial"), "> 9.3 mi");
});
```
> Note: the range separator is an **en dash** `–` (U+2013), not a hyphen — match it exactly in the implementation.

- [ ] **Step 2: Run it — `node --test tests/bands.test.js` → FAIL** (module not found).

- [ ] **Step 3: Implement** — create `js/bands.js`:

```js
// js/bands.js — PURE distance-band classification + range formatting. No DOM deps; unit-testable.
const M_PER_MILE = 1609.344;

// Ascending, half-open [minM, maxM). maxM null = open-ended (the last band).
export const BANDS = [
  { key: "short", minM: 0, maxM: 5000 },
  { key: "moderate", minM: 5000, maxM: 10000 },
  { key: "long", minM: 10000, maxM: 15000 },
  { key: "fullday", minM: 15000, maxM: null },
];

// Band key for a distance in meters. Non-finite/negative → "short" (never drop a hike).
export function bandForDistance(distanceM) {
  const d = Number(distanceM);
  if (!Number.isFinite(d) || d < 0) return "short";
  for (const b of BANDS) {
    if (d >= b.minM && (b.maxM == null || d < b.maxM)) return b.key;
  }
  return "fullday";
}

// One boundary in the active units: metric whole km (no decimals), imperial 1 decimal.
function boundary(meters, units) {
  return units === "imperial" ? (meters / M_PER_MILE).toFixed(1) : String(meters / 1000);
}

// Human range for a band, e.g. "< 5 km" / "5–10 km" / "> 15 km" (or mi). En dash separator.
export function formatBandRange(band, units = "metric") {
  const u = units === "imperial" ? "mi" : "km";
  if (band.minM === 0) return `< ${boundary(band.maxM, units)} ${u}`;
  if (band.maxM == null) return `> ${boundary(band.minM, units)} ${u}`;
  return `${boundary(band.minM, units)}–${boundary(band.maxM, units)} ${u}`;
}
```

- [ ] **Step 4: Run it — `node --test tests/bands.test.js` → PASS** (4 tests).

- [ ] **Step 5: Commit**

```bash
git add js/bands.js tests/bands.test.js
git commit -m "feat(list): pure distance-band classification + range formatting"
```
(Append the repo's Co-Authored-By footer to every commit in this plan.)

---

## Task 2: `js/search.js` — name matching (pure, TDD)

**Files:** Create `js/search.js`; Test `tests/search.test.js`.

- [ ] **Step 1: Write the failing test** — create `tests/search.test.js`:

```js
// tests/search.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText, searchHikes } from "../js/search.js";

test("normalizeText strips diacritics, lowercases, trims", () => {
  assert.equal(normalizeText("  Štrbské Pleso "), "strbske pleso");
  assert.equal(normalizeText(null), "");
});

const HIKES = [
  { slug: "a", name: { en: "Štrbské pleso loop", sk: "Štrbské pleso okruh" } },
  { slug: "b", name: { en: "Rysy summit", sk: "Výstup na Rysy" } },
];

test("searchHikes: diacritic- and case-insensitive substring on EN or SK", () => {
  assert.deepEqual(searchHikes(HIKES, "strbske").map((h) => h.slug), ["a"]);
  assert.deepEqual(searchHikes(HIKES, "RYSY").map((h) => h.slug), ["b"]);
  assert.deepEqual(searchHikes(HIKES, "výstup").map((h) => h.slug), ["b"]); // SK-only match
  assert.deepEqual(searchHikes(HIKES, "pleso").map((h) => h.slug), ["a"]);
});

test("searchHikes: empty/whitespace query → []", () => {
  assert.deepEqual(searchHikes(HIKES, ""), []);
  assert.deepEqual(searchHikes(HIKES, "   "), []);
});
```

- [ ] **Step 2: Run it — `node --test tests/search.test.js` → FAIL.**

- [ ] **Step 3: Implement** — create `js/search.js`:

```js
// js/search.js — PURE hike name search. No DOM deps; unit-testable.

// NFD-decompose, strip combining diacritics, lowercase, trim — so "Štrbské" ~ "strbske".
export function normalizeText(s) {
  return String(s == null ? "" : s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

// Hikes whose EN or SK name contains the query (case- & diacritic-insensitive). Empty query → [].
export function searchHikes(hikes, query) {
  const q = normalizeText(query);
  if (!q) return [];
  return (hikes || []).filter((h) => {
    const en = normalizeText(h && h.name && h.name.en);
    const sk = normalizeText(h && h.name && h.name.sk);
    return en.includes(q) || sk.includes(q);
  });
}
```

- [ ] **Step 4: Run it — `node --test tests/search.test.js` → PASS** (3 tests).

- [ ] **Step 5: Commit**

```bash
git add js/search.js tests/search.test.js
git commit -m "feat(list): pure diacritic-insensitive hike name search"
```

---

## Task 3: Grouped list rendering (`trails.js` + i18n + CSS, glue)

**Files:** Modify `js/i18n.js`, `js/trails.js`, `css/styles.css`. No unit test (DOM glue); verify with `node --check` + suite green + manual.

- [ ] **Step 1: i18n band labels** — in `js/i18n.js` `DICT`, add after the `"status.partial"` entry:
```js
  "band.short": { en: "Short", sk: "Krátke" },
  "band.moderate": { en: "Moderate", sk: "Stredné" },
  "band.long": { en: "Long", sk: "Dlhé" },
  "band.fullday": { en: "Full-day", sk: "Celodenné" },
```

- [ ] **Step 2: `trails.js` — import bands** — add below the existing `stats-format` import (line 7):
```js
import { BANDS, bandForDistance, formatBandRange } from "./bands.js";
```

- [ ] **Step 3: `trails.js` — replace `renderList`** (currently lines 79–109) with a grouped version plus an extracted `renderRow`:
```js
function renderList() {
  const list = document.getElementById("hike-list");
  if (!list) return;
  list.innerHTML = "";
  const u = units();
  for (const band of BANDS) {
    const inBand = HIKES.filter((h) => bandForDistance(h.distance_m) === band.key);
    if (!inBand.length) continue;
    const group = document.createElement("details");
    group.className = "hike-group";
    group.dataset.band = band.key;
    const summary = document.createElement("summary");
    summary.textContent =
      `${t(DICT, `band.${band.key}`, lang())} · ${formatBandRange(band, u)} · ${inBand.length}`;
    group.appendChild(summary);
    for (const hike of inBand) group.appendChild(renderRow(hike));
    list.appendChild(group);
  }
}

function renderRow(hike) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "hike-row";
  row.dataset.slug = hike.slug;

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
  return row;
}
```

- [ ] **Step 4: `css/styles.css` — group styling** — append to the public (non-admin) section, right after the `.hike-row-stats` / `.detail-stat strong` rules:
```css
.hike-group { border-bottom: 1px solid var(--chrome-border); }
.hike-group:last-child { border-bottom: 0; }
.hike-group > summary {
  list-style: none; cursor: pointer; padding: 9px 12px; font-weight: 700;
  color: var(--accent); font-size: 13px; display: flex; align-items: center; gap: 6px;
}
.hike-group > summary::-webkit-details-marker { display: none; }
.hike-group > summary::before { content: "▸"; font-size: 11px; transition: transform .15s; }
.hike-group[open] > summary::before { transform: rotate(90deg); }
```

- [ ] **Step 5: Verify** — `node --check js/trails.js`; `node --test` (green); **manual:** the list shows collapsed band headers (`Short · < 5 km · 3` …); empty bands absent; tapping a header expands/collapses; rows inside look as before; toggling language changes labels, toggling units changes ranges.

- [ ] **Step 6: Commit**

```bash
git add js/i18n.js js/trails.js css/styles.css
git commit -m "feat(list): group hikes into collapsible distance bands"
```

---

## Task 4: Selection expands + highlights (`trails.js` + CSS, glue)

**Files:** Modify `js/trails.js`, `css/styles.css`.

- [ ] **Step 1: `trails.js` — `select` + `applySelection`** — replace the current `select` (lines 111–117) with:
```js
function select(slug) {
  SELECTED = slug;
  const hike = HIKES.find((h) => h.slug === slug);
  if (!hike) return;
  drawRoute(hike);
  applySelection(slug);
  openDetail(slug);
}

// Reflect the selected hike in the list: clear prior highlight, open its band group, highlight +
// scroll its row. Safe when the list is hidden (the detail is open) — visible on "← Back".
function applySelection(slug) {
  const list = document.getElementById("hike-list");
  if (!list) return;
  list.querySelectorAll(".hike-row.selected").forEach((el) => el.classList.remove("selected"));
  const row = list.querySelector(`.hike-row[data-slug="${slug}"]`);
  if (!row) return;
  row.classList.add("selected");
  const group = row.closest("details.hike-group");
  if (group) group.open = true;
  row.scrollIntoView({ block: "nearest" });
}
```

- [ ] **Step 2: `trails.js` — re-apply on re-render** — at the END of `renderList` (after the `for (const band of BANDS)` loop, before the closing `}`), add:
```js
  if (SELECTED) applySelection(SELECTED);
```

- [ ] **Step 3: `css/styles.css` — selected row** — append after the `.hike-group[open] > summary::before` rule:
```css
.hike-row.selected { color: var(--accent); font-weight: 700; }
```

- [ ] **Step 4: Verify** — `node --check js/trails.js`; `node --test` (green); **manual:** tapping a row highlights it (accent, bold) and its group stays open; open a hike then ← Back → the row is highlighted and its band open; toggle units while a hike is selected → list re-renders but the selected hike's band re-opens + stays highlighted.

- [ ] **Step 5: Commit**

```bash
git add js/trails.js css/styles.css
git commit -m "feat(list): selecting a hike opens its band + highlights the row"
```

---

## Task 5: Search autocomplete dropdown (`index.html` + `trails.js` + i18n + CSS, glue)

**Files:** Modify `index.html`, `js/i18n.js`, `js/trails.js`, `css/styles.css`.

- [ ] **Step 1: `index.html` — enable search + add dropdown** — replace the `.searchbox` block:
```html
    <div class="searchbox">
      <input type="search" id="search" disabled
             data-i18n="search.placeholder" data-i18n-attr="placeholder"
             placeholder="Search a place or trail…" />
    </div>
```
with:
```html
    <div class="searchbox">
      <input type="search" id="search" autocomplete="off"
             data-i18n="search.placeholder" data-i18n-attr="placeholder"
             placeholder="Search a place or trail…" />
      <div id="search-suggestions" class="search-suggestions" hidden></div>
    </div>
```

- [ ] **Step 2: `js/i18n.js` — no-matches label** — add after the `error.dataUnavailable` entry:
```js
  "search.noMatches": { en: "No matches", sk: "Žiadne výsledky" },
```

- [ ] **Step 3: `js/trails.js` — import + wire** — add below the bands import:
```js
import { searchHikes } from "./search.js";
```
In `initTrails`, after the `renderList();` call (line 58), add:
```js
  initSearch();
```
Add the `initSearch` function (e.g. just before `renderError`):
```js
function initSearch() {
  const input = document.getElementById("search");
  const box = document.getElementById("search-suggestions");
  if (!input || !box) return;
  let matches = [];

  const close = () => { box.hidden = true; box.innerHTML = ""; };

  function pick(slug) {
    select(slug);
    input.value = "";
    close();
  }

  function render() {
    const q = input.value;
    box.innerHTML = "";
    if (!q.trim()) { close(); return; }
    matches = searchHikes(HIKES, q).slice(0, 8);
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = t(DICT, "search.noMatches", lang());
      box.appendChild(empty);
      box.hidden = false;
      return;
    }
    for (const hike of matches) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "search-item";

      const top = document.createElement("span");
      top.className = "hike-row-top";
      const name = document.createElement("span");
      name.textContent = hike.name[lang()] || hike.name.en;
      const badge = document.createElement("span");
      badge.className = `status-badge ${hike.status}`;
      badge.textContent = t(DICT, `status.${hike.status}`, lang());
      top.append(name, badge);
      item.appendChild(top);

      const parts = statParts(hike);
      if (parts.length) {
        const stats = document.createElement("span");
        stats.className = "hike-row-stats";
        stats.textContent = parts.join(" · ");
        item.appendChild(stats);
      }

      item.addEventListener("click", () => pick(hike.slug));
      box.appendChild(item);
    }
    box.hidden = false;
  }

  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && matches.length) { e.preventDefault(); pick(matches[0].slug); }
    else if (e.key === "Escape") { close(); }
  });
  document.addEventListener("click", (e) => {
    if (!box.contains(e.target) && e.target !== input) close();
  });
}
```

- [ ] **Step 4: `css/styles.css` — dropdown** — append:
```css
.searchbox { position: relative; }
.search-suggestions {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 1100;
  background: var(--chrome-bg); border: 1px solid var(--chrome-border);
  border-radius: var(--radius); box-shadow: var(--shadow);
  max-height: 60vh; overflow-y: auto;
}
.search-item {
  display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left;
  padding: 8px 12px; border: 0; background: transparent; cursor: pointer;
  font: inherit; color: var(--text); border-bottom: 1px solid var(--chrome-border);
}
.search-item:last-child { border-bottom: 0; }
.search-item:hover { color: var(--accent); }
.search-empty { padding: 8px 12px; font-size: 13px; color: var(--muted); }
```

- [ ] **Step 5: Verify** — `node --check js/trails.js`; `node --test` (green); **manual:** the search box is enabled; typing shows up to 8 suggestions (name + status badge + stat line); a non-matching query shows "No matches"; clicking a suggestion (or Enter) opens the hike's detail, draws the route, clears the box, and on ← Back the hike's band is open + the row highlighted; `strbske` finds `Štrbské…`; Escape / clicking away closes the dropdown.

- [ ] **Step 6: Commit**

```bash
git add index.html js/i18n.js js/trails.js css/styles.css
git commit -m "feat(list): name-search autocomplete dropdown that jumps to a hike"
```

---

## Self-Review notes (for the implementer)

- **Type/shape consistency:** `bandForDistance(distanceM)` and `formatBandRange(band, units)` are used exactly as defined (Task 3 `renderList` passes a `BANDS` element + `units()` string `"metric"`/`"imperial"`). `searchHikes(HIKES, query)` returns prepared hike objects (with `name.en`/`name.sk`/`distance_m`/`status`), which `initSearch` renders via the same `statParts` helper used by `renderRow`. `applySelection(slug)` matches rows by the `data-slug` set in `renderRow`. The `select` signature is unchanged (callers in `renderRow` and `initSearch` pass a slug).
- **Spec coverage:** §3 bands/grouping → Tasks 1, 3; §4 search → Tasks 2, 5; §5 selection expand/highlight + re-apply on re-render → Task 4; §6 modules → all; §7 error handling → empty/no-match (Task 5), diacritics (Task 2), non-finite distance → short (Task 1), empty band omitted (Task 3), re-apply SELECTED (Task 4); §8 tests → Tasks 1, 2 unit + manual elsewhere.
- **Reuse, not duplication:** `renderRow` is shared by the list; `initSearch`'s suggestion markup intentionally mirrors it (name + badge + `statParts`) but is a separate, simpler element (`.search-item`) — acceptable small duplication for a distinct widget.
- **No regressions:** the detail panel, route drawing, status badges, stats line, and unit/lang toggles are unchanged; `renderList`'s new grouping still produces `.hike-row` buttons with the same click → `select` behavior. `node --test` only loads `tests/*.test.js` (the two new pure suites + existing); it never imports `trails.js`.
