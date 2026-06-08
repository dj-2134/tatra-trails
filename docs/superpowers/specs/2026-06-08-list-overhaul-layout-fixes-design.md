# TatraTrails — List Overhaul Layout Fixes — Design Spec

**Date:** 2026-06-08
**Status:** Design approved in brainstorming; ready for implementation planning.
**Builds on:** Increment B (list overhaul — shipped). Fixes two layout bugs surfaced by the new
grouped list + search box. CSS-only; no JS, markup, or data changes.

> **Roadmap context.** Cleanup pass on Increment B before moving to C (regions) / D (visibility).
> A third reported bug — the top-bar brand "jumping" — is **out of scope**: it is no longer
> reproducible.

---

## 1. Purpose

Two layout bugs remain from the Increment B list overhaul:

1. **Search dropdown hidden under the panel** — the autocomplete suggestions render *behind* the
   floating "Popular hikes" panel instead of over it.
2. **Mobile search "blob"** — at narrow widths the now-functional search box collapses to a tiny
   pill, leaving no room to type.

Both are fixable in `css/styles.css` alone.

---

## 2. Scope

**In scope:**
- Raise the top bar's stacking context above the panel so the search dropdown paints over it.
- Reflow the mobile (`≤640px`) top bar so the search box occupies a full-width second row.

**Out of scope (YAGNI / not reproducible):**
- The **brand-jump** bug — no longer observed; nothing to fix.
- Any JS, markup, data-model, admin, or RLS change.
- Any change to **desktop** layout (the fixes are the global topbar `z-index` and the existing
  mobile media query; desktop never wraps and its stacking is unchanged).

---

## 3. Bug 1 — search dropdown z-index

**Symptom.** Typing in the search box shows suggestions, but the dropdown appears *behind* the
left panel.

**Root cause.** `.topbar` and `.panel` are **both** `z-index: 1000` at the root stacking context
(`styles.css:36`, `:60`). The dropdown's own `z-index: 1100` (`:203`) only orders elements *within*
the topbar's stacking context — it cannot lift the dropdown out of the topbar. Because `.panel`
appears later in the DOM with an **equal** root z-index, the entire panel paints on top of the
entire topbar subtree, dropdown included.

**Fix.** Lift the whole top bar above the panel:

| selector  | property  | from   | to       |
|-----------|-----------|--------|----------|
| `.topbar` | `z-index` | `1000` | **`1100`** |

`.panel` stays at `1000`. `.search-suggestions { z-index: 1100 }` is left as-is — it now resolves
correctly within the lifted topbar. Since the dropdown lives inside the topbar, lifting the topbar
makes the dropdown overlay the panel. One-line change, no markup change.

**Note.** The topbar is already meant to float above the map and panels, so raising it above the
`1000`-band siblings (panel, legend) is the intended layering, not a hack.

---

## 4. Bug 2 — mobile search box collapses to a blob

**Symptom.** At `≤640px` the search box shrinks to a tiny rounded pill with no usable width.

**Root cause.** The mobile media query sets `.searchbox { flex-basis: 0 }` (`styles.css:84`), which
combines with the base `flex: 0 1 320px` (`:46`) to yield effective `flex: 0 1 0` — zero basis and
`flex-grow: 0`, so the box cannot claim any width. This was acceptable when search was disabled;
now that search is a primary feature it must have room.

**Fix (full-width own row).** In the existing `@media (max-width: 640px)` block:

- `.topbar { flex-wrap: wrap; }` — permit a second row.
- Replace `.searchbox { flex-basis: 0; }` with **`.searchbox { flex: 1 1 100%; order: 1; }`** — the
  `100%` basis forces the search box onto its own row; `order: 1` (vs the default `0` on `.brand`
  and `.controls`) places that row **below** brand + controls.
- `.panel { top: 108px; }` (was `72px`) — clear the now two-row top bar so the panel does not
  overlap it.

Resulting mobile layout:

```
≤640px  (two rows)
┌───────────────────────────────┐
│ 🏔 TatraTrails      EN|SK km 🌙│   ← row 1: brand (left) + controls (right)
│ [ Search a place or trail… ▾ ]│   ← row 2: full-width search; dropdown anchors here
└───────────────────────────────┘
```

Because `.searchbox` is already `position: relative` (`:201`) and `#search-suggestions` is
`position: absolute; left: 0; right: 0`, the dropdown spans the full-width search box for free. With
Bug 1 fixed (topbar `z-index: 1100`), that dropdown correctly overlays the panel on mobile too.

**The `108px` value is approximate** — it must clear the rendered two-row topbar height (top
`12px` + ~two ~36px rows + the `8px` flex gap ≈ 90px, plus breathing room). Tune visually during
implementation; the principle (panel top must sit below the wrapped topbar) is what matters.

---

## 5. Error handling / edge cases

- **Desktop unchanged.** The topbar `z-index` bump does not alter desktop layout, and the mobile
  rules live in the `≤640px` query — the desktop row still fits without wrapping.
- **Dropdown-over-panel on mobile** is now *desired* (the search dropdown should sit above the panel
  while searching), and Bug 1's fix delivers it.
- **Landscape phones / tablets just over 640px** keep the single-row desktop layout; the breakpoint
  is unchanged.

---

## 6. Testing

**Unit tests:** none added — these are pure CSS layout changes. Existing `tests/bands.test.js` and
`tests/search.test.js` are unaffected and must still pass.

**Manual verification:**
- **Desktop:** type in the search box → the suggestions dropdown appears **over** the panel (not
  clipped behind it). Click/Enter/Escape behavior unchanged.
- **Mobile (~360px width):** the search box is a **full-width second row**, not a collapsed blob;
  typing shows a full-width dropdown that **overlays** the panel; the "Popular hikes" panel sits
  fully **below** the (two-row) top bar with no overlap.
- **Breakpoint sanity:** just above `640px` the layout stays single-row as before.

---

## 7. Code structure

**Modified:** `css/styles.css` only.
- `.topbar` — `z-index: 1000` → `1100`.
- `@media (max-width: 640px)` — add `.topbar { flex-wrap: wrap }`; replace the `.searchbox`
  `flex-basis: 0` rule with `flex: 1 1 100%; order: 1`; add `top: 108px` to `.panel`.

No new files. No JS, HTML, data-model, admin, RLS, or build changes.
