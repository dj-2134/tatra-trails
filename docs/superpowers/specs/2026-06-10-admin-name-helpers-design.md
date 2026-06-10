# TatraTrails — Admin Name-Editing Conveniences — Design Spec

**Date:** 2026-06-10
**Status:** Design approved in brainstorming; ready for implementation planning.
**Builds on / branch:** extends `regions-increment-c` (TatraTrails). Admin-only; no public-site or DB change.

---

## 1. Purpose

Two small conveniences in the admin hike editor:
1. **Prefill `Name (SK)` from the uploaded GPX file's `<name>`**, so creating a hike from a GPX needs less
   retyping (geometry/stats/region already auto-fill on upload).
2. **A clickable "→" chip** that copies the arrow character to the clipboard, since hike names are often
   route-style (e.g. `Štrbské Pleso → Popradské Pleso`) and the arrow is awkward to type.

---

## 2. Scope

**In scope:**
- A pure `gpxName(gpxText)` in `js/admin/gpx.js` (unit-tested).
- `onGpxChange` in `js/admin/ui.js` prefilling `#f-name-sk` from it (non-destructive).
- A "→" copy-to-clipboard chip in `admin.html` + its click handler in `js/admin/ui.js`.

**Out of scope (YAGNI):**
- Prefilling `name_en` (English name has no reliable GPX source; left to the founder).
- Overwriting a `name_sk` the founder already typed (fill-only-when-empty — see §4).
- Insert-at-cursor for the arrow (clipboard copy is enough; can revisit if wanted).
- Any other special characters.

---

## 3. `gpxName(gpxText)` — pure extraction

In `js/admin/gpx.js` (pure, DOM-free, regex-based like `gpxToLineString`/`gpxStats`):
- Return the text of the first `<name>…</name>` element, **preferring** a `<name>` inside `<trk>`, then
  inside `<rte>`, then inside `<metadata>`; fall back to the first `<name>` anywhere.
- Trim whitespace; decode the five basic XML entities (`&amp; &lt; &gt; &quot; &apos;`).
- Return `null` when there is no usable name (absent, or empty after trim).

This is the only new pure unit; it has one clear job (GPX text → a name string or null).

---

## 4. Prefill behavior (`onGpxChange`)

After geometry parses successfully (alongside the existing distance/ascent/duration/region prefill):
- `const name = gpxName(text);`
- **If `name` is non-null AND `#f-name-sk` is currently empty** (after trim), set `$("f-name-sk").value = name;`.
- **Non-destructive:** if the SK field already has a value, leave it untouched (re-uploading a GPX never
  clobbers a name the founder typed/corrected).
- The existing `"auto-filled from GPX — edit if needed"` hint already covers this; no new messaging needed.
- Only `name_sk` is touched. `name_en` is never auto-filled.

---

## 5. "→" copy chip

- **Markup (`admin.html`):** a small `<button type="button" id="copy-arrow" class="chip">→</button>` placed
  next to the name fields in `<form id="hike-form">` (e.g. its own row/label so it reads as a helper, not a
  form field). `type="button"` so it never submits.
- **Handler (`js/admin/ui.js`, wired in `boot()`):** on click, `await navigator.clipboard.writeText("→")`;
  on success briefly show "copied ✓" feedback (e.g. swap the button text for ~1s, then restore to "→"); on
  failure (clipboard unavailable/denied) leave the visible "→" so it can still be selected manually. Wrap in
  try/catch so a rejected clipboard promise never throws uncaught.
- Secure-context note: `navigator.clipboard` works on `localhost` and the `https://` Pages site (both secure
  contexts), which is where the admin runs.

---

## 6. Error handling & edge cases

- **GPX with no `<name>`** → `gpxName` returns `null` → no prefill (geometry/stats still fill as today).
- **GPX `<name>` present but SK field non-empty** → left untouched (non-destructive).
- **GPX parse error** → existing `catch` path stands; `gpxName` is only read on the success path, so a bad GPX
  changes nothing extra.
- **Clipboard API unavailable/denied** → caught; the "→" stays visible for manual selection; no thrown error.

---

## 7. Code structure

**Modified:**
- `js/admin/gpx.js` — add `gpxName(gpxText)` (pure).
- `js/admin/ui.js` — call `gpxName` in `onGpxChange`; add the copy-arrow click handler + wire it in `boot()`.
- `admin.html` — add the `#copy-arrow` chip near the name fields.
- `tests/gpx.test.js` — `gpxName` cases.

No changes to the public site, the data layer, the DB, or `js/regions.js`.

---

## 8. Testing

**Unit (`node:test`, `tests/gpx.test.js`):**
- `gpxName`: extracts a `<trk><name>`; prefers `<trk><name>` over a `<metadata><name>` when both exist; falls
  back to `<rte><name>`; trims whitespace; decodes `&amp;`/`&lt;` etc.; returns `null` when no `<name>` is
  present and when the name is empty/whitespace.

**Manual verification (founder):**
- Upload a GPX whose `<name>` is set, with the SK field empty → SK fills; upload again with SK already typed →
  SK unchanged; upload a GPX with no `<name>` → SK stays empty, stats/region still fill.
- Click the "→" chip → clipboard holds "→" (paste into a name field to confirm); brief "copied ✓" shows.

---

## 9. Deferred to implementation planning

1. Exact placement/label of the "→" chip and the "copied ✓" feedback timing.
2. Whether `gpxName` strips a leading/trailing nothing beyond trim (no extra normalization planned).
