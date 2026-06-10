# Admin Name-Editing Conveniences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the admin hike editor, prefill `Name (SK)` from an uploaded GPX file's `<name>`, and add a "→" chip that copies the arrow to the clipboard.

**Architecture:** A new pure, unit-tested `gpxName(gpxText)` in `js/admin/gpx.js` extracts the name; `onGpxChange` in `js/admin/ui.js` uses it to fill `#f-name-sk` non-destructively. A small `#copy-arrow` chip in `admin.html` with a click handler in `js/admin/ui.js` writes "→" to the clipboard. Admin-only; no public-site/DB change.

**Tech Stack:** Vanilla ES modules, `node:test`, browser `navigator.clipboard`. Admin DOM glue is manually verified; `gpxName` is pure/unit-tested.

**Spec:** `docs/superpowers/specs/2026-06-10-admin-name-helpers-design.md` (commit `e0c3a7a`). **Branch:** extends `regions-increment-c`.

---

## File Structure

**Modify:**
- `js/admin/gpx.js` — add pure `gpxName(gpxText)`.
- `tests/gpx.test.js` — `gpxName` cases.
- `js/admin/ui.js` — import `gpxName`; SK prefill in `onGpxChange`; `copyArrow` handler + `boot()` wiring.
- `admin.html` — `#copy-arrow` chip near the name fields.

No public-site, data-layer, DB, or `js/regions.js` change.

---

## Task 1: Pure `gpxName(gpxText)` (TDD)

**Files:**
- Modify: `js/admin/gpx.js`
- Test: `tests/gpx.test.js`

- [ ] **Step 1: Add failing tests to `tests/gpx.test.js`**

Add `gpxName` to the existing import from `../js/admin/gpx.js` at the top of `tests/gpx.test.js` (merge into
the existing import list — do not add a duplicate import line). Then append:

```js
test("gpxName: extracts the <trk><name>", () => {
  const gpx = `<gpx><trk><name>Štrbské Pleso → Popradské Pleso</name><trkseg></trkseg></trk></gpx>`;
  assert.equal(gpxName(gpx), "Štrbské Pleso → Popradské Pleso");
});

test("gpxName: prefers <trk><name> over <metadata><name>", () => {
  const gpx = `<gpx><metadata><name>Meta name</name></metadata><trk><name>Track name</name></trk></gpx>`;
  assert.equal(gpxName(gpx), "Track name");
});

test("gpxName: falls back to <rte><name> when there is no track", () => {
  const gpx = `<gpx><rte><name>Route name</name></rte></gpx>`;
  assert.equal(gpxName(gpx), "Route name");
});

test("gpxName: trims whitespace and decodes basic XML entities", () => {
  const gpx = `<gpx><trk><name>  A &amp; B &lt;x&gt;  </name></trk></gpx>`;
  assert.equal(gpxName(gpx), "A & B <x>");
});

test("gpxName: null when there is no name or it is empty", () => {
  assert.equal(gpxName(`<gpx><trk><trkseg></trkseg></trk></gpx>`), null);
  assert.equal(gpxName(`<gpx><trk><name>   </name></trk></gpx>`), null);
  assert.equal(gpxName(""), null);
  assert.equal(gpxName(null), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/gpx.test.js`
Expected: FAIL — `gpxName is not a function` (or import error).

- [ ] **Step 3: Implement `gpxName` in `js/admin/gpx.js`**

Append (it is pure/regex-based, consistent with `gpxToLineString`/`gpxStats` in the same file):

```js
// Decode the five basic XML entities. &amp; is decoded LAST so "&amp;lt;" stays literal "&lt;".
function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// First <name> text, preferring <trk> → <rte> → <metadata>, else any <name>. Trimmed + entity-decoded.
// Returns null when there is no usable (non-empty) name.
export function gpxName(gpxText) {
  const s = String(gpxText == null ? "" : gpxText);
  const nameIn = (block) => {
    if (!block) return null;
    const m = block.match(/<name>([\s\S]*?)<\/name>/i);
    return m ? m[1] : null;
  };
  const blockOf = (tag) => {
    const m = s.match(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, "i"));
    return m ? m[0] : null;
  };
  let raw = nameIn(blockOf("trk")) ?? nameIn(blockOf("rte")) ?? nameIn(blockOf("metadata"));
  if (raw == null) {
    const any = s.match(/<name>([\s\S]*?)<\/name>/i);
    raw = any ? any[1] : null;
  }
  if (raw == null) return null;
  const out = decodeXmlEntities(raw).trim();
  return out || null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/gpx.test.js`
Expected: PASS (existing gpx tests + 5 new).

- [ ] **Step 5: Commit**

```bash
git add js/admin/gpx.js tests/gpx.test.js
git commit -m "feat(admin): pure gpxName(gpxText) — extract a GPX track/route name + tests"
```

---

## Task 2: Non-destructive `Name (SK)` prefill on GPX upload

**Files:**
- Modify: `js/admin/ui.js`

DOM glue — manually verified (no unit test).

- [ ] **Step 1: Import `gpxName`**

`js/admin/ui.js` currently imports from `./gpx.js` on two separate lines
(`import { gpxToLineString } from "./gpx.js";` and `import { gpxStats } from "./gpx.js";`). Consolidate them
into a single line that also brings in `gpxName`:

```js
import { gpxToLineString, gpxStats, gpxName } from "./gpx.js";
```

(Remove the now-redundant second `./gpx.js` import line.)

- [ ] **Step 2: Prefill `#f-name-sk` in `onGpxChange`**

In `onGpxChange`, inside the `try` (after the existing region-suggestion lines that end with
`if (suggested.length) setSelectedRegionIds(suggested);`), add:

```js
    const gname = gpxName(text);
    if (gname && !$("f-name-sk").value.trim()) $("f-name-sk").value = gname;
```

(`text` is the GPX file contents already read earlier in `onGpxChange`. Non-destructive: fills only when the
SK field is empty. The existing `"auto-filled from GPX — edit if needed"` hint already covers it.)

- [ ] **Step 3: Guard the suite + manual verification**

Run: `node --test` — must stay green (ui.js isn't unit-tested; this guards against a syntax/import error).
Then serve and verify in `/admin.html` (signed in): with the SK field **empty**, upload a GPX whose `<name>`
is set → SK fills; clear nothing and re-upload with SK already typed → SK stays unchanged; upload a GPX with
no `<name>` → SK stays empty and stats/region still fill. (Founder's browser step — can't run here.)

- [ ] **Step 4: Commit**

```bash
git add js/admin/ui.js
git commit -m "feat(admin): prefill Name (SK) from GPX <name> when empty"
```

---

## Task 3: "→" copy-to-clipboard chip

**Files:**
- Modify: `admin.html`, `js/admin/ui.js`

DOM glue — manually verified.

- [ ] **Step 1: Add the chip to `admin.html`**

Inside `<form id="hike-form">`, immediately AFTER the `<label>Name (SK) <input id="f-name-sk" required /></label>`
line (and before the `#f-public` checkbox added previously), add:

```html
        <button type="button" id="copy-arrow" class="chip" title="Copy → to clipboard">→</button>
```

(`type="button"` so it never submits the form; reuses the existing `.chip` style.)

- [ ] **Step 2: Add the handler + wire it in `js/admin/ui.js`**

Add the handler (e.g. near the other small helpers):

```js
// Copy "→" to the clipboard (hike names are route-style, e.g. "A → B"). Briefly flash feedback.
async function copyArrow() {
  try {
    await navigator.clipboard.writeText("→");
    const btn = $("copy-arrow");
    btn.textContent = "copied ✓";
    setTimeout(() => { btn.textContent = "→"; }, 1000);
  } catch (e) {
    // Clipboard unavailable/denied — the visible "→" can still be selected manually.
  }
}
```

In `boot()`, alongside the other listeners, add:

```js
  $("copy-arrow").addEventListener("click", copyArrow);
```

- [ ] **Step 3: Guard the suite + manual verification**

Run: `node --test` — must stay green. Then in `/admin.html`: click the **→** chip → it flashes "copied ✓"
then returns to "→"; paste into a name field to confirm the clipboard holds "→". (Founder's browser step.)

- [ ] **Step 4: Commit**

```bash
git add admin.html js/admin/ui.js
git commit -m "feat(admin): → copy-to-clipboard chip for route-style hike names"
```

---

## Notes for the implementer

- **Only `gpxName` is unit-tested** (it's pure). The `onGpxChange` prefill, the chip, and the handler are DOM
  glue — verified by serving the admin page, per project convention. Do not invent a DOM/clipboard test harness.
- **Non-destructive prefill:** fill `#f-name-sk` only when it's empty — never clobber a typed name. Only the SK
  field is touched; `name_en` is never auto-filled.
- **Commit only the listed files** (explicit `git add` paths). Do NOT `git add -A` or stage `db/admin-rls.sql`
  (it has an uncommitted local change that must stay out of the repo).
- **`&amp;` decodes last** in `decodeXmlEntities`, so an escaped entity like `&amp;lt;` stays literal `&lt;`.
