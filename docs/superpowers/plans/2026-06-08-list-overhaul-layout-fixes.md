# List Overhaul Layout Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two Increment B layout bugs — the search dropdown rendering behind the panel, and the mobile search box collapsing to a blob.

**Architecture:** Pure CSS. Bug 1 raises the top bar's root stacking context above the panel (`.topbar` `z-index` 1000 → 1100). Bug 2 reflows the `≤640px` top bar so the search box wraps to a full-width second row. No JS, markup, or data changes.

**Tech Stack:** Static site — vanilla CSS in `css/styles.css`. Existing tests are `node:test` unit tests over pure JS modules; CSS layout is **not** unit-testable here, so each task pairs a regression run (`npm test`, must stay green) with explicit **manual visual verification**.

> **Note on TDD:** These are CSS layout fixes with no automated test surface in this repo. There is no failing-test-first step to write; correctness is confirmed by (a) the existing suite still passing and (b) the manual browser checks spelled out in each task. Do not invent CSS unit tests.

> **Spec:** `docs/superpowers/specs/2026-06-08-list-overhaul-layout-fixes-design.md`

---

## File Structure

Only one file changes:

- **Modify:** `css/styles.css`
  - `.topbar` rule (line ~36): `z-index: 1000` → `1100`.
  - `@media (max-width: 640px)` block (lines ~83–86): add `.topbar { flex-wrap: wrap }`; replace `.searchbox { flex-basis: 0 }` with `.searchbox { flex: 1 1 100%; order: 1 }`; add `top: 108px` to `.panel`.

No new files. `index.html`, all `js/`, the DB, and the build are untouched.

---

## Local preview setup (used by the manual checks below)

ES modules require serving over HTTP (not `file://`). From the repo root:

```powershell
py -m http.server 8000
```

Then open `http://localhost:8000/` and use the browser's device-toolbar / responsive mode to switch between a desktop width and a ~360px mobile width. The search dropdown appears for any non-empty query — even with no data it shows a "No matches" row, so the z-index/overlay behavior is verifiable regardless of whether Supabase data loads.

---

## Task 1: Bug 1 — search dropdown z-index above the panel

**Files:**
- Modify: `css/styles.css` (the `.topbar` rule, currently line 36)

- [ ] **Step 1: Raise the top bar above the panel**

In `css/styles.css`, find the `.topbar` rule and change its `z-index` from `1000` to `1100`. The target line is unique (it is the only `z-index: 1000` line that also contains `right: 12px`):

Change:

```css
  position: fixed; top: 12px; left: 12px; right: 12px; z-index: 1000;
```

to:

```css
  position: fixed; top: 12px; left: 12px; right: 12px; z-index: 1100;
```

Leave `.panel` (`z-index: 1000`), `.legend` (`z-index: 1000`), and `.search-suggestions` (`z-index: 1100`) unchanged.

- [ ] **Step 2: Run the regression suite (must stay green)**

Run: `npm test`
Expected: all tests pass (e.g. `# pass <N>`, `# fail 0`). CSS is not covered by these tests; this only confirms nothing else broke.

- [ ] **Step 3: Manual visual verification (desktop)**

Serve the site (`py -m http.server 8000`, open `http://localhost:8000/`) at a desktop width. Type any text into the search box.
Expected: the suggestions dropdown renders **over** the "Popular hikes" panel — not clipped behind it. (Empty query → no dropdown; non-empty → dropdown with matches or a "No matches" row, both sitting above the panel.)

- [ ] **Step 4: Commit**

```powershell
git add css/styles.css
git commit -m "fix(ui): lift topbar above panel so search dropdown overlays it"
```

---

## Task 2: Bug 2 — mobile search box full-width row

**Files:**
- Modify: `css/styles.css` (the `@media (max-width: 640px)` block, currently lines 83–86)

- [ ] **Step 1: Reflow the mobile top bar**

In `css/styles.css`, replace the existing media-query block:

```css
@media (max-width: 640px) {
  .searchbox { flex-basis: 0; }
  .panel { width: calc(100% - 24px); }
}
```

with:

```css
@media (max-width: 640px) {
  .topbar { flex-wrap: wrap; }
  .searchbox { flex: 1 1 100%; order: 1; }
  .panel { width: calc(100% - 24px); top: 108px; }
}
```

This lets the top bar wrap, forces the search box onto its own full-width row (the `100%` basis), and drops that row **below** brand + controls (`order: 1` vs their default `0`). `.panel { top: 108px }` (was `72px`) clears the now two-row top bar.

- [ ] **Step 2: Run the regression suite (must stay green)**

Run: `npm test`
Expected: all tests pass, `# fail 0`. (Again, CSS-only change; confirms no collateral breakage.)

- [ ] **Step 3: Manual visual verification (mobile ~360px)**

Serve the site and switch to ~360px width. Check all of:
- The search box is a **full-width second row** below the brand + control chips — **not** a collapsed pill/blob.
- Typing shows a **full-width** dropdown that **overlays** the "Popular hikes" panel (Bug 1's fix applies here too).
- The "Popular hikes" panel sits **fully below** the two-row top bar with **no overlap**. If the panel tucks under the top bar, increase `.panel { top }` by a few px until it clears; if there's a large gap, decrease it. Re-verify after any tweak.

- [ ] **Step 4: Breakpoint sanity (just above 640px)**

At ~700px width, confirm the top bar is still a **single row** (brand · search · controls) exactly as before — the wrap only applies at `≤640px`.

- [ ] **Step 5: Commit**

```powershell
git add css/styles.css
git commit -m "fix(ui): full-width mobile search row so it no longer collapses to a blob"
```

---

## Done criteria

- `npm test` green (unchanged count from before this work).
- Desktop: search dropdown overlays the panel.
- Mobile (~360px): search is a usable full-width row; its dropdown overlays the panel; the panel clears the top bar.
- >640px: layout unchanged (single row).
- Only `css/styles.css` changed across both commits; `db/admin-rls.sql` left untouched.
