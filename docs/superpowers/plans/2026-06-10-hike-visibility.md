# Per-Hike Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the founder mark an individual hike public/private, gating it on the public board's list and search in addition to the existing per-region toggle.

**Architecture:** Add a `hikes.is_public` column (default `true`). Add ONE gate to the already-shared pure filter `publicVisibleHikes` in `js/regions.js` — the list and search inherit it because both route through that function. Map the column through the public data layer and expose a "Public" checkbox in the admin editor. Display-level only (no RLS); consistent with Increment C.

**Tech Stack:** Vanilla ES modules, `node:test`, Supabase Postgres + PostgREST, GitHub Pages. Public site dependency-free; admin uses supabase-js.

**Spec:** `docs/superpowers/specs/2026-06-10-hike-visibility-design.md` (commit `652d4bf`). **Branch:** extends `regions-increment-c`.

---

## File Structure

**Create:** `db/add-hike-visibility.sql` — migration adding `hikes.is_public`.

**Modify:**
- `db/schema.sql` — add `is_public` to the canonical `hikes` definition.
- `js/regions.js` — one extra gate in `publicVisibleHikes`.
- `js/data.js` — add `is_public` to the hikes `SELECT`.
- `js/hikes.js` — map `is_public` onto the prepared hike.
- `js/admin/store.js` — `listHikes` selects `is_public`.
- `js/admin/ui.js` — `blankHike` / `editHike` / `loadEditor` / `formToHike`.
- `admin.html` — a `Public` checkbox.
- `tests/regions.test.js`, `tests/hikes.test.js`, `tests/data.test.js` — coverage.
- `README.md` — one-line note.

No change to `js/trails.js` or `groupHikesByRegion` (they consume `publicVisibleHikes` unchanged).

---

## Task 1: Database migration — `hikes.is_public`

**Files:**
- Create: `db/add-hike-visibility.sql`
- Modify: `db/schema.sql`

- [ ] **Step 1: Write `db/add-hike-visibility.sql`**

```sql
-- db/add-hike-visibility.sql — run in Supabase Studio → SQL Editor.
-- Per-hike public/private. Default true so existing hikes stay visible (still gated by region).
-- Display-level only in this increment (no RLS change); hard enforcement is a later increment.
-- Idempotent.
alter table hikes add column if not exists is_public boolean not null default true;
```

- [ ] **Step 2: Mirror into `db/schema.sql`**

In `db/schema.sql`, add `is_public` to the `hikes` `create table` — insert this line right after the
`seasonal_partial boolean not null default false,` line (keeping the file's existing column style):

```sql
  is_public boolean not null default true,
```

- [ ] **Step 3: Verify (manual — founder runs it)**

Founder runs `db/add-hike-visibility.sql`. Expected: no error; `select count(*) from hikes where is_public;`
equals the total hike count (all existing rows default to `true`).

- [ ] **Step 4: Commit**

```bash
git add db/add-hike-visibility.sql db/schema.sql
git commit -m "feat(db): hikes.is_public column for per-hike visibility (default true)"
```

---

## Task 2: The visibility gate in `publicVisibleHikes` (TDD)

**Files:**
- Modify: `js/regions.js`
- Test: `tests/regions.test.js`

- [ ] **Step 1: Add failing tests to `tests/regions.test.js`**

The file already has a fixture `R` (with `R.vt` = public Vysoké Tatry, id 1) and a helper
`const h = (slug, distance_m, region_ids) => ({ slug, distance_m, region_ids });`. Append these tests:

```js
test("publicVisibleHikes: a hike with is_public:false is excluded even in a public region", () => {
  const hikes = [
    { ...h("vis", 1000, [1]) },                       // public region, no flag -> visible (lenient)
    { ...h("hidden", 1000, [1]), is_public: false },  // public region but hike private -> excluded
    { ...h("shown", 1000, [1]), is_public: true },    // explicit true -> visible
  ];
  const got = publicVisibleHikes(hikes, [R.vt]).map((x) => x.slug).sort();
  assert.deepEqual(got, ["shown", "vis"]);
});

test("groupHikesByRegion: a public region whose only hike is private is omitted", () => {
  const hikes = [{ ...h("hidden", 1000, [1]), is_public: false }];
  assert.deepEqual(groupHikesByRegion(hikes, [R.vt]), []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/regions.test.js`
Expected: FAIL — the new tests fail (the private hike is currently included; the region is not omitted).

- [ ] **Step 3: Add the gate in `js/regions.js`**

In `publicVisibleHikes`, add the `h.is_public !== false` gate before the region check. The function becomes:

```js
// Hikes belonging to >=1 public region AND not individually hidden. region_ids: number[];
// is_public defaults to public when absent (lenient: only an explicit false hides a hike).
export function publicVisibleHikes(hikes, regions) {
  const pub = publicRegionIdSet(regions);
  return (hikes || []).filter(
    (h) => h.is_public !== false && (h.region_ids || []).some((id) => pub.has(id))
  );
}
```

(`groupHikesByRegion` is unchanged — it already calls `publicVisibleHikes`, so the gate propagates.)

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/regions.test.js`
Expected: PASS — new tests pass; all pre-existing `regions` tests still pass (their hikes omit `is_public`,
so `!== false` keeps them visible).

- [ ] **Step 5: Commit**

```bash
git add js/regions.js tests/regions.test.js
git commit -m "feat(regions): gate publicVisibleHikes on per-hike is_public (list + search inherit it)"
```

---

## Task 3: Data layer — request and map `is_public`

**Files:**
- Modify: `js/data.js`, `js/hikes.js`
- Test: `tests/hikes.test.js`, `tests/data.test.js`

- [ ] **Step 1: Add failing test to `tests/hikes.test.js`**

Append:

```js
test("prepareHikes: maps is_public (absent → true, explicit false → false)", () => {
  const geom = { type: "LineString", coordinates: [[0, 0], [1, 1]] };
  const [a, b] = prepareHikes([
    { slug: "a", name_en: "A", name_sk: "A", geometry: geom },                   // no is_public
    { slug: "b", name_en: "B", name_sk: "B", geometry: geom, is_public: false }, // explicit false
  ], { iso: "2026-06-10", mmdd: "06-10" });
  assert.equal(a.is_public, true);
  assert.equal(b.is_public, false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/hikes.test.js`
Expected: FAIL — `a.is_public` / `b.is_public` are `undefined` (not yet mapped).

- [ ] **Step 3: Map `is_public` in `js/hikes.js`**

In `prepareHike`'s returned object, add this line (after `region_ids`):

```js
    is_public: row.is_public !== false,
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/hikes.test.js`
Expected: PASS.

- [ ] **Step 5: Add `is_public` to the public `SELECT` in `js/data.js`**

Change the stat-columns line of the `SELECT` constant from:

```js
  "distance_m,ascent_m,duration_min," +
```
to:
```js
  "distance_m,ascent_m,duration_min,is_public," +
```

- [ ] **Step 6: Assert it's requested in `tests/data.test.js`**

The existing `tests/data.test.js` "fetchHikes requests the stat columns" test captures the URL. Add one line
to that test's body (after the existing `assert.match(... /distance_m,ascent_m,duration_min/)`):

```js
  assert.match(decodeURIComponent(captured), /is_public/);
```

- [ ] **Step 7: Run the suite**

Run: `node --test`
Expected: ALL pass (existing + new). No pre-existing test should regress.

- [ ] **Step 8: Commit**

```bash
git add js/data.js js/hikes.js tests/hikes.test.js tests/data.test.js
git commit -m "feat(data): request + map hikes.is_public on prepared hikes"
```

---

## Task 4: Admin — the "Public" checkbox

**Files:**
- Modify: `admin.html`, `js/admin/store.js`, `js/admin/ui.js`

DOM/Supabase glue — manually verified (no unit test, per project convention).

- [ ] **Step 1: Add the checkbox to `admin.html`**

Inside `<form id="hike-form">`, immediately after the `<label>Name (SK) <input id="f-name-sk" required /></label>`
line, add:

```html
        <label class="admin-check"><input id="f-public" type="checkbox" /> Public (visible on the board)</label>
```

(`.admin-check` is the existing class used by the seasonal `Partial` checkbox.)

- [ ] **Step 2: Select `is_public` in `js/admin/store.js` `listHikes`**

In `listHikes`, change the stat-columns segment of the `.select(...)` string from:

```js
        "distance_m,ascent_m,duration_min," +
```
to:
```js
        "distance_m,ascent_m,duration_min,is_public," +
```

- [ ] **Step 3: Wire it through `js/admin/ui.js`**

Four edits:

(a) In `blankHike()`, add to the returned object:
```js
    is_public: true,
```

(b) In `editHike(row)`, add to the object passed to `loadEditor({...})`:
```js
    is_public: row.is_public !== false,
```

(c) In `loadEditor(h)`, alongside the other field assignments (e.g. right after the `$("f-name-sk").value` line), add:
```js
  $("f-public").checked = h.is_public !== false;
```

(d) In `formToHike()`, add to the returned column-shaped object (it IS a hikes column, so it belongs in the
upsert payload):
```js
    is_public: $("f-public").checked,
```

- [ ] **Step 4: Guard the suite + manual verification**

Run: `node --test` — must still pass (ui.js isn't unit-tested; this guards against a syntax error in an
imported module). Then serve and verify against a migrated DB (Task 1 applied):

```powershell
python -m http.server 8000
```

In `/admin.html` (signed in): the editor shows a **Public** checkbox; a brand-new hike has it **checked**;
editing an existing hike reflects its stored value. Untick it for a hike in a public region, Save → that hike
disappears from the public board's list **and** search; re-tick + Save → it returns. (Cannot run a browser
here — this is the founder's step.)

- [ ] **Step 5: Commit**

```bash
git add admin.html js/admin/store.js js/admin/ui.js
git commit -m "feat(admin): per-hike Public checkbox (load + save is_public)"
```

---

## Task 5: Docs + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a note to `README.md`**

In the "Regions" subsection (added in Increment C), add a short line under the admin/visibility material, e.g.:

> Each hike also has its own **Public** toggle in the editor. A hike shows on the public board only when its
> hike flag is public **and** it belongs to ≥1 public region (both gates). New hikes default to public.
> Like the region toggle, this is display-level only in this increment.

- [ ] **Step 2: Full test run**

Run: `node --test`
Expected: ALL pass. Record the count.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: per-hike visibility note"
```

---

## Notes for the implementer

- **Lenient gate:** `is_public !== false` means a hike is public unless explicitly `false`. This matches the
  "public by default" decision and is why existing `regions.test.js` hikes (which omit the field) stay visible.
- **`is_public` IS a `hikes` column** — it belongs in `formToHike()`'s upsert payload (contrast with
  `region_ids`, which must NOT go in the payload and persists separately via `setHikeRegions`).
- **No `js/trails.js` change:** the list and search both call `publicVisibleHikes`, so the single gate in
  `js/regions.js` covers both.
- **Display-level:** no RLS change; the anon API still returns all rows. Hard enforcement is Increment D.
