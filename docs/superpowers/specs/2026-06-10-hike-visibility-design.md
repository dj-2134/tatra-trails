# TatraTrails — Per-Hike Visibility — Design Spec

**Date:** 2026-06-10
**Status:** Design approved in brainstorming; ready for implementation planning.
**Builds on:** Increment C (regions). Extends the same branch `regions-increment-c` (unmerged). C added a
per-**region** `is_public` toggle and a display-level public-visible filter that powers both the list and
search via `publicVisibleHikes(hikes, regions)` in `js/regions.js`.

> **Roadmap context.** This pulls a slice of Increment D (visibility) forward: **per-hike** public/private,
> on top of C's per-region toggle. As with C, visibility here is **display-level only**; hard server-side
> (RLS) enforcement remains Increment D.

---

## 1. Purpose

Let the founder hide or show an **individual hike**, in addition to hiding/showing an entire region. A hike
might need to stay private (draft, seasonal, not-yet-ready) even though its region is public.

---

## 2. Scope

**In scope:**
- A new `hikes.is_public` boolean column (default `true`).
- One added gate in the existing `publicVisibleHikes` filter so the public **list and search** respect it.
- A **"Public" checkbox** in the admin hike editor (load + save).
- README note. Display-level only.

**Out of scope (later / YAGNI):**
- Hard RLS enforcement of `is_public` (regions **or** hikes) → Increment D.
- Any per-hike "friends/owner" tiering → Increment D.
- Changing the region-level toggle (unchanged).

---

## 3. Combination rule (the core semantic)

A hike is **public-visible** iff:

> `hike.is_public !== false`  **AND**  it belongs to **≥1 public region**.

Both gates apply (logical AND). Consequences:
- Making a **region** private hides all its hikes regardless of their own flag (a private region contributes
  no public membership).
- Within a public region, an individually-**private** hike is hidden.
- A public region whose hikes are **all** private becomes empty → omitted from the list (existing
  empty-region behavior, now reachable via hike flags too).

The check is **lenient** (`!== false`, not `=== true`): a hike missing the field is treated as public,
matching the "public by default" decision and keeping existing tests/data valid.

---

## 4. Data model

`ALTER TABLE hikes ADD COLUMN is_public boolean not null default true;`

- Existing rows become `true` (current content keeps showing, still gated by region).
- Migration file `db/add-hike-visibility.sql` (idempotent: `add column if not exists`); mirror the column
  into the canonical `db/schema.sql` `hikes` definition.
- No RLS change (display-level in this increment; the existing `public read using (true)` stands).

---

## 5. Data flow

**Public path:**
- `js/data.js` — add `is_public` to the hikes `SELECT`.
- `js/hikes.js` — `prepareHike` maps `is_public: row.is_public !== false` onto the prepared hike.
- `js/regions.js` — `publicVisibleHikes(hikes, regions)` adds the `h.is_public !== false` gate alongside the
  existing public-region check. **No change needed in `groupHikesByRegion` or `js/trails.js`** — both already
  route through `publicVisibleHikes`, so the list and search inherit the gate.

**Admin path:**
- `js/admin/store.js` — `listHikes` `.select(...)` adds `is_public`.
- `js/admin/ui.js`:
  - `blankHike()` → `is_public: true`.
  - `editHike(row)` → carry `is_public: row.is_public !== false` into the editor state.
  - `loadEditor(h)` → set the checkbox from `h.is_public`.
  - `formToHike()` → include `is_public: <checkbox>.checked` in the returned column-shaped hike. **Unlike
    `region_ids`, `is_public` IS a `hikes` column**, so it belongs in the `upsertHike` payload.
- `admin.html` — a `Public` checkbox in `<form id="hike-form">` (e.g. `id="f-public"`), styled with the
  existing `.admin-check` class used by the seasonal-partial checkbox.

---

## 6. Error handling & edge cases

- **Missing/undefined `is_public`** on a hike → treated as public (`!== false`). Defensive; shouldn't occur
  post-migration (column is `NOT NULL DEFAULT true`).
- **Private hike in a private region** → hidden (both gates fail) — no special-casing.
- **All hikes in a public region private** → region renders empty → omitted (existing behavior).
- **Admin editing** an existing hike preserves its current `is_public` (loaded into the checkbox); a brand-new
  hike defaults to checked (public).

---

## 7. Code structure

**New:** `db/add-hike-visibility.sql`.

**Modified:**
- `db/schema.sql` — `is_public` column on `hikes`.
- `js/data.js` — `SELECT` adds `is_public`.
- `js/hikes.js` — map `is_public`.
- `js/regions.js` — one extra gate in `publicVisibleHikes`.
- `js/admin/store.js` — `listHikes` selects `is_public`.
- `js/admin/ui.js` — `blankHike` / `editHike` / `loadEditor` / `formToHike`.
- `admin.html` — `Public` checkbox.
- `tests/regions.test.js`, `tests/hikes.test.js` — see §8.
- `README.md` — one-line note under the regions section.

No change to `js/trails.js` or `groupHikesByRegion` (they consume `publicVisibleHikes` unchanged).

---

## 8. Testing

**Unit (`node:test`):**
- `tests/regions.test.js`:
  - `publicVisibleHikes`: a hike with `is_public: false` in a public region is **excluded**; a hike with
    `is_public: true` (or the field absent) in a public region is **included**; the region-gate cases continue
    to pass.
  - `groupHikesByRegion`: a public region whose only hike is `is_public: false` is **omitted** (empty).
- `tests/hikes.test.js`: `prepareHikes` maps `is_public` (a row with `is_public: false` → prepared
  `is_public === false`; a row omitting it → `true`).

**Manual verification (founder):** run `db/add-hike-visibility.sql`; in admin, untick **Public** on a hike in
a public region and confirm it disappears from the public list **and** search; re-tick and confirm it returns;
confirm a brand-new hike defaults to Public.

---

## 9. Deferred to implementation planning

1. Exact checkbox id/label and its placement in the hike-editor form.
2. Whether the admin left-pane hike list visually marks private hikes (nice-to-have; default **no** — YAGNI
   unless requested).
