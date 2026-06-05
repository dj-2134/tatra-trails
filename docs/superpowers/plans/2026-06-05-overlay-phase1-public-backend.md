# TatraTrails Overlay — Phase 1 (Public Product on Supabase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a curated set of High Tatras hikes as a live "Popular hikes" conditions board (open/closed/partial badges) backed by a free Supabase database, where selecting a hike draws its route on the map.

**Architecture:** Static GitHub Pages frontend (existing) reads `hikes` + nested `closures` from Supabase's auto REST API (PostgREST) with a read-only anon key locked down by Row-Level Security. Pure `status.js`/`hikes.js` modules compute each hike's current status **in the browser** against today's Bratislava date, so "right now" stays live. The map is clean by default; selecting a hike from the list draws that one route (status-colored via CSS) and zooms to it. Geometry is stored as GeoJSON in a JSONB column (no PostGIS this phase).

**Tech Stack:** Vanilla ES modules, Leaflet 1.9, `node:test`, Supabase (Postgres + PostgREST + RLS), GitHub Pages, GitHub Actions.

**Source spec:** `docs/superpowers/specs/2026-06-05-trail-open-closed-overlay-design.md`

**Commit convention:** This repo uses conventional commits ending with a `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. Append that trailer to every commit below (omitted from the step commands only to keep them short).

---

## Prerequisites (one-time manual setup — do before Task 7)

These are account/dashboard steps the engineer performs once; no code.

- [ ] Create a free Supabase account and a new project (region: EU, e.g. Frankfurt). Note the **Project URL** (`https://<ref>.supabase.co`), the **anon public key**, and the **service_role key**.
- [ ] In the GitHub repo: **Settings → Secrets and variables → Actions**, add repository secrets `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (the `MAPY_API_KEY` secret already exists). The service_role key is **not** stored here and never ships to the browser.

---

## File Structure

**Create:**
- `js/status.js` — PURE status computation (seasonal + ad-hoc → open/closed/partial). Unit-tested.
- `js/hikes.js` — PURE `prepareHikes(rows, today)`: maps API rows → render-ready hikes with status. Unit-tested.
- `js/data.js` — thin async `fetchHikes({url,key}, fetchImpl)` against PostgREST. Unit-tested with a stub.
- `js/trails.js` — DOM/Leaflet orchestration: fetch → prepare → render list → draw selected route → detail. (Manual verification.)
- `tests/status.test.js`, `tests/hikes.test.js`, `tests/data.test.js`
- `db/schema.sql` — tables, constraints, RLS policies.
- `db/seed.sql` — minimal real starter set (4 hikes) exercising all three statuses.
- `.github/workflows/keepalive.yml` — daily cron ping so the free project doesn't pause.

**Modify:**
- `js/i18n.js` — add legend/status/detail/error keys.
- `js/main.js` — call `initTrails(map)` after `initMap`.
- `js/ui.js` — dispatch a `tt:langchange` event on language change.
- `js/config.example.js` — add Supabase URL + anon key.
- `index.html` — partial legend item; turn the Popular-hikes panel into a list + detail container.
- `css/styles.css` — `--partial`, `.swatch.partial`, hike-list/badge/detail styles, `path.trail--*` route colors.
- `.github/workflows/pages.yml` — inject Supabase config alongside the Mapy key.
- `README.md` — Supabase setup, secrets, OSM attribution.

---

## Task 1: `status.js` — pure status computation (TDD)

**Files:**
- Create: `js/status.js`
- Test: `tests/status.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/status.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUSES, seasonalActive, adhocActive, computeStatus } from "../js/status.js";

const today = { mmdd: "06-05", iso: "2026-06-05" };

test("status values are open/closed/partial", () => {
  assert.deepEqual(STATUSES, ["open", "closed", "partial"]);
});

test("seasonalActive handles a year-wrapping window (Nov 1 - Jun 15)", () => {
  const s = { from: "11-01", to: "06-15" };
  assert.equal(seasonalActive(s, "10-31"), false); // day before
  assert.equal(seasonalActive(s, "11-01"), true);  // start
  assert.equal(seasonalActive(s, "01-15"), true);  // across New Year
  assert.equal(seasonalActive(s, "06-15"), true);  // end (inclusive)
  assert.equal(seasonalActive(s, "06-16"), false); // day after
});

test("seasonalActive handles a normal (non-wrapping) window", () => {
  const s = { from: "03-01", to: "03-31" };
  assert.equal(seasonalActive(s, "02-28"), false);
  assert.equal(seasonalActive(s, "03-15"), true);
  assert.equal(seasonalActive(s, "04-01"), false);
});

test("seasonalActive is false when there is no seasonal window", () => {
  assert.equal(seasonalActive(null, "06-05"), false);
  assert.equal(seasonalActive({ from: null, to: null }, "06-05"), false);
});

test("adhocActive: inclusive range, and null to_date means ongoing", () => {
  assert.equal(adhocActive({ from_date: "2026-06-01", to_date: "2026-06-10" }, "2026-06-05"), true);
  assert.equal(adhocActive({ from_date: "2026-06-06", to_date: "2026-06-10" }, "2026-06-05"), false);
  assert.equal(adhocActive({ from_date: "2026-06-01", to_date: "2026-06-04" }, "2026-06-05"), false);
  assert.equal(adhocActive({ from_date: "2026-06-01", to_date: null }, "2026-06-05"), true);
});

test("computeStatus: no rules -> open", () => {
  assert.equal(computeStatus(null, [], today).status, "open");
});

test("computeStatus: active full seasonal -> closed", () => {
  const r = computeStatus({ from: "11-01", to: "06-15", partial: false }, [], today);
  assert.equal(r.status, "closed");
  assert.equal(r.activeClosures.length, 1);
});

test("computeStatus: active partial seasonal -> partial", () => {
  assert.equal(computeStatus({ from: "11-01", to: "06-15", partial: true }, [], today).status, "partial");
});

test("computeStatus: a full ad-hoc overrides a seasonally-open hike", () => {
  const r = computeStatus(null, [{ from_date: "2026-06-01", to_date: null, partial: false }], today);
  assert.equal(r.status, "closed");
});

test("computeStatus: precedence full > partial > open", () => {
  const seasonal = { from: "11-01", to: "06-15", partial: true }; // partial active
  const adhoc = [{ from_date: "2026-06-01", to_date: null, partial: false }]; // full active
  assert.equal(computeStatus(seasonal, adhoc, today).status, "closed");
});

test("computeStatus: inactive ad-hoc does not affect an open hike", () => {
  const r = computeStatus(null, [{ from_date: "2026-04-01", to_date: "2026-04-10", partial: false }], today);
  assert.equal(r.status, "open");
  assert.equal(r.activeClosures.length, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/status.test.js`
Expected: FAIL — cannot find module `../js/status.js` / exports undefined.

- [ ] **Step 3: Write the minimal implementation**

```javascript
// js/status.js
// Pure status computation — no DOM/clock deps, so it is unit-testable.
// Inputs use plain strings: seasonal windows are "MM-DD"; ad-hoc dates are "YYYY-MM-DD".
// Zero-padded fixed-width date strings compare correctly with < and >.
export const STATUSES = ["open", "closed", "partial"];

// seasonal: { from:"MM-DD", to:"MM-DD", partial?:bool } | null ; todayMMDD: "MM-DD"
export function seasonalActive(seasonal, todayMMDD) {
  if (!seasonal || !seasonal.from || !seasonal.to) return false;
  const { from, to } = seasonal;
  return from <= to
    ? todayMMDD >= from && todayMMDD <= to
    : todayMMDD >= from || todayMMDD <= to; // window wraps the year boundary
}

// closure: { from_date:"YYYY-MM-DD", to_date:"YYYY-MM-DD"|null } ; todayISO: "YYYY-MM-DD"
export function adhocActive(closure, todayISO) {
  if (!closure || !closure.from_date) return false;
  if (todayISO < closure.from_date) return false;
  if (closure.to_date == null) return true; // ongoing
  return todayISO <= closure.to_date;
}

// seasonal as above | null ; adhocList: closure[] ; today: { mmdd, iso }
// Returns { status: "open"|"closed"|"partial", activeClosures: [...] }
export function computeStatus(seasonal, adhocList, today) {
  const activeClosures = [];
  let full = false;
  let partial = false;

  if (seasonalActive(seasonal, today.mmdd)) {
    activeClosures.push({ kind: "seasonal", partial: !!seasonal.partial, from: seasonal.from, to: seasonal.to });
    if (seasonal.partial) partial = true; else full = true;
  }
  for (const c of adhocList || []) {
    if (adhocActive(c, today.iso)) {
      activeClosures.push({ kind: "adhoc", ...c });
      if (c.partial) partial = true; else full = true;
    }
  }

  const status = full ? "closed" : partial ? "partial" : "open";
  return { status, activeClosures };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/status.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add js/status.js tests/status.test.js
git commit -m "feat: pure status.js (seasonal+adhoc -> open/closed/partial, year-wrap)"
```

---

## Task 2: `hikes.js` — pure `prepareHikes` (TDD)

**Files:**
- Create: `js/hikes.js`
- Test: `tests/hikes.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/hikes.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareHikes } from "../js/hikes.js";

const today = { mmdd: "06-05", iso: "2026-06-05" };

const rows = [
  {
    slug: "loop", name_en: "Loop", name_sk: "Okruh",
    geometry: { type: "LineString", coordinates: [[20.06, 49.11], [20.07, 49.12]] },
    seasonal_from: null, seasonal_to: null, seasonal_partial: false,
    note_en: null, note_sk: null, ref: null, closures: [],
  },
  {
    slug: "high", name_en: "High route", name_sk: "Vysoká trasa",
    geometry: { type: "LineString", coordinates: [[20.2, 49.15], [20.21, 49.18]] },
    seasonal_from: "11-01", seasonal_to: "06-15", seasonal_partial: true,
    note_en: "Upper part", note_sk: "Horná časť", ref: "https://tanap.sk/",
    closures: [],
  },
  { slug: "broken", name_en: "No geom", name_sk: "x", geometry: null, closures: [] },
];

test("prepareHikes maps rows, computes status, and skips rows without geometry", () => {
  const out = prepareHikes(rows, today);
  assert.equal(out.length, 2); // "broken" dropped
  const loop = out.find((h) => h.slug === "loop");
  const high = out.find((h) => h.slug === "high");
  assert.equal(loop.status, "open");
  assert.deepEqual(loop.name, { en: "Loop", sk: "Okruh" });
  assert.equal(loop.note, null);
  assert.equal(high.status, "partial"); // seasonal partial active on 06-05
  assert.deepEqual(high.note, { en: "Upper part", sk: "Horná časť" });
  assert.equal(high.ref, "https://tanap.sk/");
  assert.ok(high.geometry.type === "LineString");
});

test("prepareHikes tolerates null/empty input", () => {
  assert.deepEqual(prepareHikes(null, today), []);
  assert.deepEqual(prepareHikes([], today), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/hikes.test.js`
Expected: FAIL — cannot find module `../js/hikes.js`.

- [ ] **Step 3: Write the minimal implementation**

```javascript
// js/hikes.js
// Pure mapping from Supabase API rows to render-ready hikes (with computed status).
import { computeStatus } from "./status.js";

function prepareHike(row, today) {
  const seasonal = row.seasonal_from && row.seasonal_to
    ? { from: row.seasonal_from, to: row.seasonal_to, partial: !!row.seasonal_partial }
    : null;
  const { status, activeClosures } = computeStatus(seasonal, row.closures || [], today);
  const note = row.note_en || row.note_sk ? { en: row.note_en || "", sk: row.note_sk || "" } : null;
  return {
    slug: row.slug,
    name: { en: row.name_en, sk: row.name_sk },
    note,
    ref: row.ref || null,
    geometry: row.geometry,
    status,
    activeClosures,
  };
}

export function prepareHikes(rows, today) {
  return (rows || [])
    .filter((r) => r && r.slug && r.geometry)
    .map((r) => prepareHike(r, today));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/hikes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/hikes.js tests/hikes.test.js
git commit -m "feat: pure prepareHikes maps API rows to render-ready hikes with status"
```

---

## Task 3: `data.js` — fetch hikes + nested closures (TDD with stub)

**Files:**
- Create: `js/data.js`
- Test: `tests/data.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/data.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchHikes } from "../js/data.js";

test("fetchHikes hits PostgREST with the anon key and returns parsed rows", async () => {
  let captured;
  const stub = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200, json: async () => [{ slug: "x" }] };
  };
  const rows = await fetchHikes({ url: "https://p.supabase.co", key: "KEY" }, stub);
  assert.deepEqual(rows, [{ slug: "x" }]);
  assert.match(captured.url, /^https:\/\/p\.supabase\.co\/rest\/v1\/hikes\?select=/);
  assert.match(decodeURIComponent(captured.url), /closures\(/); // nested closures requested
  assert.equal(captured.opts.headers.apikey, "KEY");
  assert.equal(captured.opts.headers.Authorization, "Bearer KEY");
});

test("fetchHikes throws on a non-ok response", async () => {
  const stub = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(() => fetchHikes({ url: "u", key: "k" }, stub), /503/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/data.test.js`
Expected: FAIL — cannot find module `../js/data.js`.

- [ ] **Step 3: Write the minimal implementation**

```javascript
// js/data.js
// Thin read-only client for the Supabase PostgREST API. Config is passed in (not imported)
// so this module stays unit-testable without js/config.js present.
const SELECT =
  "slug,name_en,name_sk,geometry,seasonal_from,seasonal_to,seasonal_partial,note_en,note_sk,ref," +
  "closures(from_date,to_date,partial,reason_en,reason_sk,source)";

// config: { url, key } ; fetchImpl defaults to the global fetch (browser).
export async function fetchHikes({ url, key }, fetchImpl = fetch) {
  const endpoint = `${url}/rest/v1/hikes?select=${encodeURIComponent(SELECT)}`;
  const res = await fetchImpl(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/data.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/data.js tests/data.test.js
git commit -m "feat: read-only Supabase fetchHikes (hikes + nested closures)"
```

---

## Task 4: i18n keys for status, legend, detail, errors

**Files:**
- Modify: `js/i18n.js` (the `DICT` object)

- [ ] **Step 1: Add the new keys to `DICT`**

In `js/i18n.js`, extend the `DICT` object (keep existing keys) with:

```javascript
  "legend.partial": { en: "Partially closed", sk: "Čiastočne uzavreté" },
  "status.open": { en: "Open", sk: "Otvorené" },
  "status.closed": { en: "Closed", sk: "Zatvorené" },
  "status.partial": { en: "Partially closed", sk: "Čiastočne uzavreté" },
  "detail.back": { en: "← Back", sk: "← Späť" },
  "detail.seasonal": { en: "Seasonal closure", sk: "Sezónna uzávera" },
  "detail.ongoing": { en: "ongoing", sk: "trvá" },
  "detail.source": { en: "Source", sk: "Zdroj" },
  "detail.note": { en: "Note", sk: "Poznámka" },
  "detail.disclaimer": {
    en: "Awareness only. Always verify with TANAP / mountain rescue (HZS) before you go; the absence of a closure here is not a guarantee a trail is open or safe.",
    sk: "Len pre informáciu. Pred túrou si vždy overte stav u TANAP / Horskej záchrannej služby (HZS); chýbajúca uzávera tu neznamená, že chodník je otvorený alebo bezpečný.",
  },
  "error.dataUnavailable": {
    en: "Trail data is unavailable right now.",
    sk: "Údaje o chodníkoch nie sú momentálne dostupné.",
  },
```

- [ ] **Step 2: Run the i18n test (existing test already asserts every key has en+sk)**

Run: `node --test tests/i18n.test.js`
Expected: PASS (the "real dictionary has both languages for every key" test now also covers the new keys).

- [ ] **Step 3: Commit**

```bash
git add js/i18n.js
git commit -m "feat: i18n keys for status, partial legend, hike detail, errors"
```

---

## Task 5: CSS — partial color, hike list, badges, detail, route colors

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: Add `--partial` to both theme blocks**

In `:root` (after `--closed: #dc2626;`) add:
```css
  --partial: #d97706;
```
In `html.dark` (after `--closed: #f87171;`) add:
```css
  --partial: #fbbf24;
```

- [ ] **Step 2: Add the partial legend swatch (after `.swatch.closed`)**

```css
.swatch.partial { background: var(--partial); }
```

- [ ] **Step 3: Append the hike-list, badge, detail, route and disclaimer styles**

Append to the end of `css/styles.css`:

```css
/* ---- Popular hikes list + detail (inside .panel) ---- */
.panel-title { font-weight: 700; color: var(--accent); padding: 0 2px 2px; }
.hike-list {
  background: var(--chrome-bg); border: 1px solid var(--chrome-border);
  border-radius: var(--radius); box-shadow: var(--shadow);
  max-height: 50vh; overflow-y: auto; display: flex; flex-direction: column;
}
.hike-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 9px 12px; border: 0; background: transparent; cursor: pointer;
  font: inherit; color: var(--text); text-align: left; width: 100%;
  border-bottom: 1px solid var(--chrome-border);
}
.hike-row:last-child { border-bottom: 0; }
.hike-row:hover { color: var(--accent); }
.status-badge {
  flex: none; font-size: 11px; font-weight: 700; color: #fff;
  padding: 2px 8px; border-radius: 999px; white-space: nowrap;
}
.status-badge.open { background: var(--open); }
.status-badge.closed { background: var(--closed); }
.status-badge.partial { background: var(--partial); }

.trail-detail {
  background: var(--chrome-bg); border: 1px solid var(--chrome-border);
  border-radius: var(--radius); box-shadow: var(--shadow); padding: 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.trail-detail h2 { margin: 0; font-size: 15px; color: var(--accent); }
.trail-detail .closure { font-size: 13px; }
.trail-detail .note { font-size: 13px; color: var(--text); }
.trail-detail a { color: var(--accent); }
.detail-back {
  align-self: flex-start; border: 0; background: transparent; color: var(--accent);
  font: inherit; cursor: pointer; padding: 0;
}
.disclaimer { font-size: 11px; color: var(--muted); line-height: 1.35; }

/* ---- Drawn route colors (CSS overrides Leaflet's stroke presentation attr) ---- */
path.trail--open { stroke: var(--open); }
path.trail--closed { stroke: var(--closed); }
path.trail--partial { stroke: var(--partial); }
```

- [ ] **Step 4: Commit**

```bash
git add css/styles.css
git commit -m "feat: styles for partial status, hike list, status badges, route colors"
```

---

## Task 6: `index.html` — partial legend item + panel list/detail containers

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the "Partially closed" legend item**

In the `<div class="legend">`, between the `open` and `closed` items (or after `closed`), add:
```html
    <span class="legend-item"><i class="swatch partial" aria-hidden="true"></i><span data-i18n="legend.partial">Partially closed</span></span>
```

- [ ] **Step 2: Replace the Popular-hikes placeholder with a list + detail container**

Replace the existing `<aside class="panel" id="panel"> ... </aside>` block with:

```html
  <aside class="panel" id="panel">
    <div class="panel-title" data-i18n="panel.popularHikes">Popular hikes</div>
    <div id="hike-list" class="hike-list" aria-label="Popular hikes"></div>
    <div id="trail-detail" class="trail-detail" hidden></div>
    <button class="panel-section" type="button">
      <span data-i18n="panel.planRoute">Plan a route</span>
      <small data-i18n="panel.comingSoon">Coming soon</small>
    </button>
  </aside>
```

(The `#hike-list` is filled by `trails.js`; `#trail-detail` is shown when a hike is selected. "Plan a route" stays a coming-soon placeholder.)

- [ ] **Step 3: Verify the page still loads (no JS errors yet for the empty list)**

Run: `python -m http.server 8000` then open `http://localhost:8000`.
Expected: map + top bar render; the panel shows the "Popular hikes" title and an empty list box; the legend shows three items (Open / Closed / Partially closed). (List stays empty until Task 11.)

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: partial legend item + Popular-hikes list/detail containers"
```

---

## Task 7: Supabase schema + RLS

**Files:**
- Create: `db/schema.sql`

Depends on: Prerequisites (Supabase project exists).

- [ ] **Step 1: Write the schema file**

```sql
-- db/schema.sql — run in Supabase Studio → SQL Editor.
create table if not exists hikes (
  id bigint generated always as identity primary key,
  slug text unique not null,
  name_en text not null,
  name_sk text not null,
  geometry jsonb not null,                                  -- GeoJSON LineString/MultiLineString
  seasonal_from text check (seasonal_from ~ '^[0-9][0-9]-[0-9][0-9]$'),
  seasonal_to   text check (seasonal_to   ~ '^[0-9][0-9]-[0-9][0-9]$'),
  seasonal_partial boolean not null default false,
  note_en text,
  note_sk text,
  ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasonal_pair check ((seasonal_from is null) = (seasonal_to is null))
);

create table if not exists closures (
  id bigint generated always as identity primary key,
  hike_id bigint not null references hikes(id) on delete cascade,
  from_date date not null,
  to_date date,
  partial boolean not null default false,
  reason_en text not null,
  reason_sk text not null,
  source text,
  created_at timestamptz not null default now(),
  constraint date_order check (to_date is null or to_date >= from_date)
);

create index if not exists closures_hike_id_idx on closures (hike_id);

-- Row-Level Security: public may READ; only authenticated admin may write.
alter table hikes enable row level security;
alter table closures enable row level security;

create policy "public read hikes"    on hikes    for select using (true);
create policy "public read closures" on closures for select using (true);
create policy "admin write hikes"     on hikes    for all to authenticated using (true) with check (true);
create policy "admin write closures"  on closures for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Apply it**

In Supabase Studio → **SQL Editor**, paste the contents of `db/schema.sql` and **Run**.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify RLS + tables exist**

In the SQL Editor run:
```sql
select tablename, rowsecurity from pg_tables where tablename in ('hikes','closures');
```
Expected: two rows, `rowsecurity = true` for both.

- [ ] **Step 4: Commit**

```bash
git add db/schema.sql
git commit -m "feat: Supabase schema for hikes/closures with constraints + RLS"
```

---

## Task 8: Seed a minimal real starter set + import procedure

**Files:**
- Create: `db/seed.sql`

- [ ] **Step 1: Write the seed file**

The geometry below is **coarse but real** (a few points per route) — enough to draw and exercise all three statuses. Precise geometry is imported later via the procedure in Step 4.

```sql
-- db/seed.sql — run after db/schema.sql. Coarse starter geometry; refine via import procedure.
insert into hikes (slug, name_en, name_sk, geometry, seasonal_from, seasonal_to, seasonal_partial, note_en, note_sk, ref) values
('strbske-lakeside-loop', 'Štrbské Pleso lakeside loop', 'Okruh okolo Štrbského plesa',
 '{"type":"LineString","coordinates":[[20.0600,49.1180],[20.0650,49.1205],[20.0620,49.1230],[20.0560,49.1210],[20.0600,49.1180]]}'::jsonb,
 null, null, false, null, null, 'https://www.tanap.sk/'),
('strbske-popradske', 'Štrbské Pleso → Popradské Pleso', 'Štrbské Pleso → Popradské Pleso',
 '{"type":"LineString","coordinates":[[20.0626,49.1192],[20.0731,49.1356],[20.0888,49.1577]]}'::jsonb,
 '11-01', '06-15', false, null, null, 'https://www.tanap.sk/'),
('hrebienok-zbojnicka', 'Hrebienok → Zbojnícka Chata', 'Hrebienok → Zbojnícka chata',
 '{"type":"LineString","coordinates":[[20.2316,49.1585],[20.2180,49.1740],[20.2069,49.1899]]}'::jsonb,
 '11-01', '06-15', true, 'Upper section seasonally closed', 'Horný úsek sezónne uzavretý', 'https://www.tanap.sk/'),
('popradske-rysy', 'Popradské Pleso → Rysy', 'Popradské Pleso → Rysy',
 '{"type":"LineString","coordinates":[[20.0888,49.1577],[20.0886,49.1690],[20.0883,49.1795]]}'::jsonb,
 null, null, false, null, null, 'https://www.tanap.sk/')
on conflict (slug) do nothing;

-- An active, ongoing full ad-hoc closure on the Rysy route (demonstrates ad-hoc + source link).
insert into closures (hike_id, from_date, to_date, partial, reason_en, reason_sk, source)
select id, '2026-06-01', null, false, 'Rockfall', 'Zosuv kameňov', 'https://www.tanap.sk/'
from hikes where slug = 'popradske-rysy';
```

- [ ] **Step 2: Apply it**

In Supabase Studio → SQL Editor, paste `db/seed.sql` and **Run**.

- [ ] **Step 3: Verify the seed and expected statuses (as of 2026-06-05)**

Run:
```sql
select slug, seasonal_from, seasonal_to, seasonal_partial,
       (select count(*) from closures c where c.hike_id = h.id) as closures
from hikes h order by slug;
```
Expected 4 rows. Sanity of computed statuses today: `strbske-lakeside-loop` → open; `strbske-popradske` → closed (seasonal full); `hrebienok-zbojnicka` → partial (seasonal partial); `popradske-rysy` → closed (active ad-hoc).

- [ ] **Step 4: Document the geometry-import procedure (append to `db/seed.sql` as a comment block)**

Append this comment to `db/seed.sql` so the repeatable process lives with the data:

```sql
-- ---------------------------------------------------------------------------
-- GEOMETRY IMPORT PROCEDURE (to add a new hike or refine an existing one):
--   1. Find the route on OpenStreetMap (or record a GPX of the marked trail).
--   2. Export it to a GeoJSON LineString of [lon,lat] pairs (e.g. geojson.io:
--      draw/trace the route, or import GPX, then "Save → GeoJSON"). Keep it to
--      a sensible number of points (simplify long routes).
--   3. INSERT (or UPDATE) the hikes row, pasting the GeoJSON into `geometry`:
--        insert into hikes (slug,name_en,name_sk,geometry,seasonal_from,seasonal_to,seasonal_partial,note_en,note_sk,ref)
--        values ('<slug>','<EN>','<SK>','<GEOJSON>'::jsonb,'<MM-DD or NULL>','<MM-DD or NULL>',<bool>,<note or NULL>,<note or NULL>,'<ref or NULL>');
--   4. Seasonal dates come from TANAP's Návštevný poriadok (tanap.sk) for that section.
-- Attribution: routes traced from OpenStreetMap data are © OpenStreetMap contributors (ODbL).
-- ---------------------------------------------------------------------------
```

- [ ] **Step 5: Commit**

```bash
git add db/seed.sql
git commit -m "feat: seed 4 starter hikes (all statuses) + geometry-import procedure"
```

---

## Task 9: Client config + CI injection for Supabase

**Files:**
- Modify: `js/config.example.js`
- Modify: `.github/workflows/pages.yml`

- [ ] **Step 1: Extend `js/config.example.js`**

Replace its contents with:
```javascript
// Copy this file to js/config.js and fill in your keys (js/config.js is git-ignored).
// In CI these values are injected from GitHub Actions secrets instead.

// Mapy.com tile key — RESTRICT it by domain in the Mapy dashboard (used client-side).
export const MAPY_API_KEY = "YOUR_MAPY_API_KEY";

// Supabase project URL and the PUBLIC anon key. The anon key is safe to ship:
// Row-Level Security makes it read-only. NEVER put the service_role key here.
export const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";
```

- [ ] **Step 2: Update the CI "inject config" step in `.github/workflows/pages.yml`**

Replace the `Inject Mapy API key from secret` step with:
```yaml
      - name: Inject client config from secrets
        run: |
          cat > js/config.js <<EOF
          export const MAPY_API_KEY = "${{ secrets.MAPY_API_KEY }}";
          export const SUPABASE_URL = "${{ secrets.SUPABASE_URL }}";
          export const SUPABASE_PUBLISHABLE_KEY = "${{ secrets.SUPABASE_PUBLISHABLE_KEY }}";
          EOF
```

- [ ] **Step 3: Create your local `js/config.js`**

Run: `Copy-Item js/config.example.js js/config.js` (then edit it with your real Mapy key, Supabase URL, and anon key). Confirm `js/config.js` is already git-ignored:
Run: `git check-ignore js/config.js`
Expected: prints `js/config.js` (it is ignored).

- [ ] **Step 4: Commit (tracked files only — not config.js)**

```bash
git add js/config.example.js .github/workflows/pages.yml
git commit -m "feat: add Supabase URL + anon key to client config and CI injection"
```

---

## Task 10: `ui.js` — emit a language-change event

**Files:**
- Modify: `js/ui.js`

So `trails.js` can re-render the dynamic list/detail when EN/SK is toggled.

- [ ] **Step 1: Add an emitter and call it after every `applyLang`**

In `js/ui.js`, add this helper near the top of the language section:
```javascript
function emitLangChange(lang) {
  document.dispatchEvent(new CustomEvent("tt:langchange", { detail: lang }));
}
```
In `initLang()`, after the initial `applyLang(lang);` add `emitLangChange(lang);`, and inside the toggle click handler, after `applyLang(lang);` add `emitLangChange(lang);`. The function becomes:
```javascript
function initLang() {
  let lang = readStoredLang();
  applyLang(lang);
  emitLangChange(lang);
  const btn = document.getElementById("lang-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      lang = nextLang(lang);
      applyLang(lang);
      try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
      emitLangChange(lang);
    });
  }
}
```

- [ ] **Step 2: Verify nothing broke**

Run: `node --test` (all existing tests still pass; `ui.js` has no unit tests but must parse).
Then `python -m http.server 8000`, open the page, toggle EN/SK — the static `data-i18n` labels still switch as before.

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "feat: emit tt:langchange event so dynamic UI can re-render on EN/SK toggle"
```

---

## Task 11: `trails.js` orchestration + wire into `main.js` (end-to-end)

**Files:**
- Create: `js/trails.js`
- Modify: `js/main.js`

Depends on: Tasks 1–10 and a seeded Supabase project + a local `js/config.js`.

- [ ] **Step 1: Write `js/trails.js`**

```javascript
// js/trails.js — DOM/Leaflet orchestration (thin, impure binding around the pure modules).
import { fetchHikes } from "./data.js";
import { prepareHikes } from "./hikes.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
import { DICT, t } from "./i18n.js";

let MAP = null;
let HIKES = [];
let ROUTE_LAYER = null;
let SELECTED = null; // slug

function lang() {
  return document.documentElement.getAttribute("lang") === "sk" ? "sk" : "en";
}

// Today's date in the Tatras' local timezone. en-CA formats as YYYY-MM-DD.
function todayInBratislava() {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(new Date());
  return { iso, mmdd: iso.slice(5) };
}

function fmtDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(lang() === "sk" ? "sk-SK" : "en-GB", {
    day: "numeric", month: "short",
  });
}

export async function initTrails(map) {
  MAP = map;
  let rows;
  try {
    rows = await fetchHikes({ url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY });
  } catch (e) {
    renderError();
    return;
  }
  HIKES = prepareHikes(rows, todayInBratislava());
  renderList();
  document.addEventListener("tt:langchange", () => {
    renderList();
    if (SELECTED) openDetail(SELECTED);
  });
}

function renderError() {
  const list = document.getElementById("hike-list");
  if (list) list.innerHTML = `<div class="disclaimer">${t(DICT, "error.dataUnavailable", lang())}</div>`;
}

function renderList() {
  const list = document.getElementById("hike-list");
  if (!list) return;
  list.innerHTML = "";
  for (const hike of HIKES) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "hike-row";
    const name = document.createElement("span");
    name.textContent = hike.name[lang()] || hike.name.en;
    const badge = document.createElement("span");
    badge.className = `status-badge ${hike.status}`;
    badge.textContent = t(DICT, `status.${hike.status}`, lang());
    row.append(name, badge);
    row.addEventListener("click", () => select(hike.slug));
    list.appendChild(row);
  }
}

function select(slug) {
  SELECTED = slug;
  const hike = HIKES.find((h) => h.slug === slug);
  if (!hike) return;
  drawRoute(hike);
  openDetail(slug);
}

function drawRoute(hike) {
  if (ROUTE_LAYER) { MAP.removeLayer(ROUTE_LAYER); ROUTE_LAYER = null; }
  ROUTE_LAYER = L.geoJSON(hike.geometry, {
    style: { className: `trail trail--${hike.status}`, weight: 4 },
  }).addTo(MAP);
  const bounds = ROUTE_LAYER.getBounds();
  if (bounds.isValid()) MAP.fitBounds(bounds, { padding: [40, 40] });
}

function openDetail(slug) {
  const hike = HIKES.find((h) => h.slug === slug);
  const panel = document.getElementById("trail-detail");
  const list = document.getElementById("hike-list");
  if (!hike || !panel || !list) return;
  const L_ = lang();

  panel.innerHTML = "";
  const back = document.createElement("button");
  back.className = "detail-back";
  back.textContent = t(DICT, "detail.back", L_);
  back.addEventListener("click", deselect);

  const title = document.createElement("h2");
  title.textContent = hike.name[L_] || hike.name.en;

  const badge = document.createElement("span");
  badge.className = `status-badge ${hike.status}`;
  badge.textContent = t(DICT, `status.${hike.status}`, L_);

  panel.append(back, title, badge);

  for (const c of hike.activeClosures) {
    const div = document.createElement("div");
    div.className = "closure";
    if (c.kind === "seasonal") {
      div.textContent = `${t(DICT, "detail.seasonal", L_)}: ${c.from} – ${c.to}`;
    } else {
      const range = c.to_date ? `${fmtDate(c.from_date)} – ${fmtDate(c.to_date)}` : `${fmtDate(c.from_date)} – ${t(DICT, "detail.ongoing", L_)}`;
      const reason = (L_ === "sk" ? c.reason_sk : c.reason_en) || c.reason_en || "";
      div.textContent = `${range}${reason ? " · " + reason : ""}`;
      if (c.source) {
        div.append(" ");
        const a = document.createElement("a");
        a.href = c.source; a.target = "_blank"; a.rel = "noopener";
        a.textContent = t(DICT, "detail.source", L_);
        div.appendChild(a);
      }
    }
    panel.appendChild(div);
  }

  if (hike.note) {
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = `${t(DICT, "detail.note", L_)}: ${hike.note[L_] || hike.note.en}`;
    panel.appendChild(note);
  }

  const disc = document.createElement("div");
  disc.className = "disclaimer";
  disc.textContent = t(DICT, "detail.disclaimer", L_);
  panel.appendChild(disc);

  list.hidden = true;
  panel.hidden = false;
}

function deselect() {
  SELECTED = null;
  if (ROUTE_LAYER) { MAP.removeLayer(ROUTE_LAYER); ROUTE_LAYER = null; }
  const panel = document.getElementById("trail-detail");
  const list = document.getElementById("hike-list");
  if (panel) { panel.hidden = true; panel.innerHTML = ""; }
  if (list) list.hidden = false;
}
```

- [ ] **Step 2: Wire `trails.js` into `main.js`**

Replace `js/main.js` with:
```javascript
import { initUi } from "./ui.js";
import { initMap } from "./map.js";
import { initTrails } from "./trails.js";

initUi();
const map = initMap("map");
initTrails(map);
```

- [ ] **Step 3: Run the full unit-test suite (the pure modules must still pass)**

Run: `node --test`
Expected: PASS for `status`, `hikes`, `data`, `i18n`, `theme`, `layers`.

- [ ] **Step 4: Manual end-to-end verification (needs `js/config.js` with real Supabase values + the seeded DB)**

Run: `python -m http.server 8000`, open `http://localhost:8000`. Verify:
- The Popular hikes list shows the 4 seeded hikes, each with a status badge: lakeside loop = **Open** (green), Štrbské→Popradské = **Closed** (red), Hrebienok→Zbojnícka = **Partially closed** (amber), Popradské→Rysy = **Closed** (red).
- Clicking a hike draws its route on the map in the matching color and zooms to it; the detail panel shows the status, the closure reason/dates (Rysy shows "… – ongoing · Rockfall" + a Source link), the note (Hrebienok), and the disclaimer.
- "← Back" clears the route and returns to the list.
- Toggling EN/SK re-labels the list badges and the open detail.
- Toggling light/dark recolors the route line and badges with no flicker.

- [ ] **Step 5: Commit**

```bash
git add js/trails.js js/main.js
git commit -m "feat: Popular-hikes conditions board + draw-selected-route from Supabase"
```

---

## Task 12: Keep-alive cron (prevent free-tier pause)

**Files:**
- Create: `.github/workflows/keepalive.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Keep Supabase awake

on:
  schedule:
    - cron: "17 6 * * *"   # daily at 06:17 UTC
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping the Supabase REST API
        run: |
          curl -fsS "${{ secrets.SUPABASE_URL }}/rest/v1/hikes?select=id&limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}" > /dev/null
          echo "Supabase pinged OK"
```

- [ ] **Step 2: Verify the workflow file is valid YAML and references existing secrets**

Run: `node -e "const f=require('fs').readFileSync('.github/workflows/keepalive.yml','utf8'); if(!/SUPABASE_URL/.test(f)||!/cron:/.test(f)) throw new Error('keepalive workflow malformed'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/keepalive.yml
git commit -m "ci: daily keep-alive ping so the free Supabase project doesn't pause"
```

- [ ] **Step 4 (manual, after push): trigger it once**

In GitHub → Actions → "Keep Supabase awake" → **Run workflow** to confirm it succeeds.

---

## Task 13: README — Supabase setup, secrets, attribution

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Supabase section**

Insert after the existing "Local setup" section:
```markdown
## Backend (Supabase)
Hikes and closures live in a free Supabase project (Postgres + auto REST API).

1. Create a free project at https://supabase.com (EU region). Note the Project URL, the
   **anon** key, and the **service_role** key.
2. In Supabase Studio → SQL Editor, run `db/schema.sql` then `db/seed.sql`.
3. Add your Supabase URL + anon key to `js/config.js` (see `js/config.example.js`).
   The anon key is read-only via Row-Level Security and safe to ship; the service_role
   key is never committed or sent to the browser.

### Deploy secrets
Add repository **Actions secrets** `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (alongside
`MAPY_API_KEY`). CI writes them into `js/config.js` at build time. A daily
`keepalive.yml` workflow pings the API so the free project does not pause.
```

- [ ] **Step 2: Add OSM attribution to the Attribution section**

Append to the existing "Attribution" paragraph:
```markdown
Hike route geometry is traced from OpenStreetMap data (© OpenStreetMap contributors, ODbL).
Seasonal closure dates are from TANAP's Návštevný poriadok (tanap.sk).
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README for Supabase setup, deploy secrets, OSM attribution"
```

---

## Done criteria for Phase 1

- `node --test` passes (`status`, `hikes`, `data`, `i18n`, `theme`, `layers`).
- The deployed site shows the Popular-hikes list with live status badges; selecting a hike draws its color-coded route and shows detail + disclaimer; EN/SK and light/dark both work.
- Data is read from Supabase via the read-only anon key; the keep-alive workflow runs.
- Phase 2 (admin: Supabase Auth + write RLS, custom admin form, geometry-import tooling, dataset growth) is a separate plan.
