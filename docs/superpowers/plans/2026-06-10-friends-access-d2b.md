# Friends Access — Phase D2b (Client + UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an invited friend sign in with Google on the public board and see the full content (private regions/hikes), keep the anonymous board dependency-free, and give the owner an in-app friend-management UI.

**Architecture:** D2a's RLS is live (anon=public, authenticated=public-or-allowlisted, writes=owner-only). D2b adds: an optional Bearer token to the data fetchers; a **lazy** `js/auth-public.js` that imports `supabase-js` only when sign-in is initiated or an OAuth return is detected (anon visitors never load it); `js/trails.js` re-fetches authenticated and renders with `showAll` when the signed-in user is allowlisted; and an owner-only "Viewers" admin section.

**Tech Stack:** Vanilla ES modules, `supabase-js` (lazy, from esm.sh), Supabase Auth (Google OAuth), `node:test`. Auth/OAuth/glue is manually verified (needs the Google provider enabled in Supabase); the `js/data.js` token param is unit-tested.

**Spec:** `docs/superpowers/specs/2026-06-10-friends-access-d2-design.md` (commit `a83906c`). **Branch:** `master`.

> Anon must stay **dependency-free**: `supabase-js` loads only via lazy `import()` on the auth path. Never add a `supabase-js` `<script>`/static import to `index.html` or `js/main.js`.

---

## File Structure
- **Modify:** `js/data.js` (+ `tests/data.test.js`) — optional Bearer token + `fetchAllowedSelf`.
- **Create:** `js/auth-public.js` — lazy Google-OAuth helper for the board.
- **Modify:** `index.html` (Sign-in chip + auth note), `css/styles.css` (`.auth-note`), `js/i18n.js` (auth labels), `js/trails.js` (auth integration + `showAll` wiring).
- **Modify:** `js/admin/store.js`, `admin.html`, `js/admin/ui.js` — owner-only "Viewers" UI.
- **Modify:** `README.md` — Google OAuth setup.

---

## Task 1: Data layer — Bearer token + `fetchAllowedSelf` (TDD)

**Files:** Modify `js/data.js`; Test `tests/data.test.js`.

- [ ] **Step 1: Add failing tests to `tests/data.test.js`**

```js
test("fetchHikes: adds an Authorization Bearer header when a token is given", async () => {
  let seen = null;
  const stub = async (url, opts) => { seen = opts; return { ok: true, status: 200, json: async () => [] }; };
  await fetchHikes({ url: "https://p.supabase.co", key: "K" }, stub, "TOKEN123");
  assert.equal(seen.headers.apikey, "K");
  assert.equal(seen.headers.Authorization, "Bearer TOKEN123");
});

test("fetchHikes: no Authorization header when no token", async () => {
  let seen = null;
  const stub = async (url, opts) => { seen = opts; return { ok: true, status: 200, json: async () => [] }; };
  await fetchHikes({ url: "https://p.supabase.co", key: "K" }, stub);
  assert.equal(seen.headers.Authorization, undefined);
});

test("fetchAllowedSelf: hits /allowed_viewers with apikey + Bearer", async () => {
  let seen = null;
  const stub = async (url, opts) => { seen = { url, opts }; return { ok: true, status: 200, json: async () => [{ email: "me@x.io" }] }; };
  const rows = await fetchAllowedSelf({ url: "https://p.supabase.co/", key: "K" }, stub, "TOK");
  assert.match(seen.url, /\/rest\/v1\/allowed_viewers\?select=/);
  assert.equal(seen.opts.headers.Authorization, "Bearer TOK");
  assert.deepEqual(rows, [{ email: "me@x.io" }]);
});
```
(Add `fetchAllowedSelf` to the `../js/data.js` import at the top of `tests/data.test.js`.)

- [ ] **Step 2: Run — expect FAIL** (`node --test tests/data.test.js`): the token arg is ignored and `fetchAllowedSelf` is undefined.

- [ ] **Step 3: Implement in `js/data.js`**

Add a `token` param to `fetchHikes` and `fetchRegions` (after `fetchImpl`), build headers conditionally, and add `fetchAllowedSelf`. The three functions become:

```js
export async function fetchHikes({ url, key }, fetchImpl = fetch, token = null) {
  const base = url.replace(/\/+$/, "");
  const endpoint = `${base}/rest/v1/hikes?select=${encodeURIComponent(SELECT)}`;
  const headers = { apikey: key };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchImpl(endpoint, { headers });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}

export async function fetchRegions({ url, key }, fetchImpl = fetch, token = null) {
  const base = url.replace(/\/+$/, "");
  const endpoint = `${base}/rest/v1/regions?select=${encodeURIComponent(REGION_SELECT)}`;
  const headers = { apikey: key };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchImpl(endpoint, { headers });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}

// The signed-in user's own allowed_viewers row(s) (self-read RLS). Non-empty => allowlisted.
export async function fetchAllowedSelf({ url, key }, fetchImpl = fetch, token = null) {
  const base = url.replace(/\/+$/, "");
  const endpoint = `${base}/rest/v1/allowed_viewers?select=email,role`;
  const headers = { apikey: key };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchImpl(endpoint, { headers });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: Run — expect PASS** (`node --test`); report counts (existing + 3 new all pass; the no-token tests confirm the public path is unchanged).

- [ ] **Step 5: Commit**

```bash
git add js/data.js tests/data.test.js
git commit -m "feat(data): optional Bearer token on fetchers + fetchAllowedSelf (D2b)"
```

---

## Task 2: `js/auth-public.js` — lazy Google-OAuth helper

**Files:** Create `js/auth-public.js`.

DOM-light glue; manually verified (needs the live Google provider). No unit test.

- [ ] **Step 1: Create `js/auth-public.js`**

```js
// js/auth-public.js — lazy Google sign-in for the PUBLIC board. supabase-js is imported ONLY when a
// sign-in is initiated or an OAuth return / stored session is detected, so anonymous visitors never
// load it (the board stays dependency-free for them). Mirrors js/admin/auth.js's client pattern.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

let clientPromise = null;
function client() {
  if (!clientPromise) {
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2")
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY));
  }
  return clientPromise;
}

// True when the URL carries OAuth tokens (a redirect back from Google) — load eagerly to finish login.
export function hasAuthRedirect() {
  return /[#&](access_token|error_description)=/.test(window.location.hash);
}

// True when supabase-js has a persisted session in localStorage (a returning, already-signed-in user) —
// lets us decide to lazy-load auth WITHOUT loading supabase-js for a fresh anonymous visitor.
export function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) return true;
    }
  } catch (e) { /* localStorage blocked */ }
  return false;
}

export async function signInWithGoogle() {
  const supabase = await client();
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if (error) throw error;
}

export async function getSession() {
  const supabase = await client(); // creating the client also parses an OAuth-return hash + stores the session
  const { data } = await supabase.auth.getSession();
  return data.session; // null, or { access_token, user: { email }, ... }
}

export async function signOut() {
  const supabase = await client();
  await supabase.auth.signOut();
}
```

- [ ] **Step 2: Guard the suite** — `node --test` still passes (this module isn't imported by tests; confirms no syntax error in the graph if anything imports it later). Report counts.

- [ ] **Step 3: Commit**

```bash
git add js/auth-public.js
git commit -m "feat(auth): lazy Google-OAuth helper for the public board (D2b)"
```

---

## Task 3: Board sign-in + authenticated full view (`index.html`, `i18n`, CSS, `trails.js`)

**Files:** Modify `index.html`, `js/i18n.js`, `css/styles.css`, `js/trails.js`.

DOM/Supabase glue — manually verified.

- [ ] **Step 1: `index.html` — Sign-in chip + auth note**

In the `.controls` div (with the lang/units/theme chips), add as the FIRST control:
```html
      <button id="auth-toggle" class="chip" type="button">Sign in</button>
```
Inside `<aside class="panel" id="panel">`, immediately after the `panel-title` div, add:
```html
    <div id="auth-note" class="auth-note" hidden></div>
```

- [ ] **Step 2: `js/i18n.js` — auth labels**

Add to `DICT`:
```js
  "auth.signIn": { en: "Sign in", sk: "Prihlásiť sa" },
  "auth.signOut": { en: "Sign out", sk: "Odhlásiť sa" },
  "auth.guest": {
    en: "Signed in — you're not on the guest list, showing public trails only.",
    sk: "Prihlásený – nie ste na zozname hostí, zobrazujú sa len verejné trasy.",
  },
```

- [ ] **Step 3: `css/styles.css` — the note**

Append:
```css
.auth-note { font-size: 12px; color: var(--muted); padding: 6px 12px; }
```

- [ ] **Step 4: `js/trails.js` — imports + state**

Add imports:
```js
import { fetchHikes, fetchRegions, fetchAllowedSelf } from "./data.js";
import { hasAuthRedirect, hasStoredSession, signInWithGoogle, getSession, signOut } from "./auth-public.js";
```
(Replace the existing `import { fetchHikes, fetchRegions } from "./data.js";` line.) Add module state next to `let REGIONS = [];`:
```js
let SHOW_ALL = false;
let SESSION = null;
```

- [ ] **Step 5: `js/trails.js` — `renderList` + search honor `showAll`**

In `renderList`, change the grouping call to `const model = groupHikesByRegion(HIKES, REGIONS, SHOW_ALL);`. In `initSearch`'s `render()`, change the matches line to `matches = searchHikes(publicVisibleHikes(HIKES, REGIONS, SHOW_ALL), q).slice(0, 8);`.

- [ ] **Step 6: `js/trails.js` — auth wiring in `initTrails`**

At the END of `initTrails` (after `initSearch();` and the `tt:langchange`/`tt:unitchange` listeners), add:
```js
  setupAuth();
```
Add these functions to `js/trails.js`:
```js
const SB = { url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY };

function authBtn() { return document.getElementById("auth-toggle"); }

function setAuthLabel() {
  const btn = authBtn();
  if (btn) btn.textContent = t(DICT, SESSION ? "auth.signOut" : "auth.signIn", lang());
}

function setupAuth() {
  const btn = authBtn();
  if (btn) {
    setAuthLabel();
    btn.addEventListener("click", async () => {
      try {
        if (SESSION) { await signOut(); window.location.reload(); }
        else { await signInWithGoogle(); } // redirects to Google
      } catch (e) { /* leave anon */ }
    });
  }
  // Keep the label correct when language toggles.
  document.addEventListener("tt:langchange", setAuthLabel);
  // Only touch supabase-js if we're returning from OAuth or already signed in.
  if (hasAuthRedirect() || hasStoredSession()) enterAuthenticated();
}

async function enterAuthenticated() {
  let session;
  try { session = await getSession(); } catch (e) { return; }
  if (!session) return;
  SESSION = session;
  setAuthLabel();
  const token = session.access_token;
  let allowed = false;
  try { allowed = (await fetchAllowedSelf(SB, fetch, token)).length > 0; } catch (e) { allowed = false; }
  SHOW_ALL = allowed;
  const note = document.getElementById("auth-note");
  if (note) {
    if (allowed) { note.hidden = true; note.textContent = ""; }
    else { note.hidden = false; note.textContent = t(DICT, "auth.guest", lang()); }
  }
  try {
    const [hrows, rrows] = await Promise.all([
      fetchHikes(SB, fetch, token),
      fetchRegions(SB, fetch, token),
    ]);
    HIKES = prepareHikes(hrows, todayInBratislava());
    REGIONS = rrows;
    renderList();
  } catch (e) { /* keep the public render already on screen */ }
}
```
(`SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` are already imported in `trails.js`; `t`, `DICT`, `lang`, `prepareHikes`, `todayInBratislava`, `renderList`, `HIKES`, `REGIONS` already exist.)

- [ ] **Step 7: Guard the suite + manual verify**

`node --test` stays green (no pure module changed except via existing `showAll` default). Then — **once the Google provider is enabled in Supabase (Task 5)** — serve and verify: anonymous board loads with **no** `supabase-js` network request (DevTools Network) and a "Sign in" chip; clicking it runs Google OAuth; back on the board, an **allowlisted** account shows private regions/hikes + "Sign out"; a **non-allowlisted** account shows public + the guest note; Sign out reloads to the anonymous view. (Founder's browser step.)

- [ ] **Step 8: Commit**

```bash
git add index.html js/i18n.js css/styles.css js/trails.js
git commit -m "feat(board): lazy Google sign-in + authenticated full view (showAll) (D2b)"
```

---

## Task 4: Owner-only "Viewers" friend-management UI (admin)

**Files:** Modify `js/admin/store.js`, `admin.html`, `js/admin/ui.js`.

DOM/Supabase glue — manually verified.

- [ ] **Step 1: `js/admin/store.js` — viewer CRUD**

Append:
```js
// allowed_viewers management (owner-only via RLS). The owner sees the full list; friends see only self.
export async function listViewers() {
  const { data, error } = await supabase
    .from("allowed_viewers").select("email,role,added_at").order("role").order("email");
  if (error) throw error;
  return data || [];
}
export async function addViewer(email, role) {
  const { error } = await supabase
    .from("allowed_viewers").upsert({ email: email.trim().toLowerCase(), role }, { onConflict: "email" });
  if (error) throw error;
}
export async function removeViewer(email) {
  const { error } = await supabase.from("allowed_viewers").delete().eq("email", email);
  if (error) throw error;
}
```

- [ ] **Step 2: `admin.html` — Viewers section**

Inside `<aside class="admin-list-pane">`, after the `<details class="admin-visibility">…</details>` block (the region-visibility one), add:
```html
      <details class="admin-visibility">
        <summary>Viewers (friends)</summary>
        <div id="viewer-list"></div>
        <div class="admin-viewer-add">
          <input id="viewer-email" type="email" placeholder="friend@gmail.com" />
          <select id="viewer-role"><option value="friend">friend</option><option value="owner">owner</option></select>
          <button id="add-viewer" class="chip" type="button">Add</button>
        </div>
      </details>
```

- [ ] **Step 3: `js/admin/ui.js` — wire it**

Add to the store import: `listViewers, addViewer, removeViewer`. Add these functions (near `renderVisibility`):
```js
async function renderViewers() {
  const wrap = $("viewer-list");
  if (!wrap) return;
  let rows = [];
  try { rows = await listViewers(); } catch (e) { wrap.textContent = errorText(e); return; }
  wrap.innerHTML = "";
  for (const v of rows) {
    const row = document.createElement("div");
    row.className = "admin-viewer-row";
    const label = document.createElement("span");
    label.textContent = `${v.email} — ${v.role}`;
    const rm = document.createElement("button");
    rm.type = "button"; rm.className = "chip admin-danger"; rm.textContent = "✕";
    rm.addEventListener("click", async () => {
      try { await removeViewer(v.email); await renderViewers(); }
      catch (e) { alert(errorText(e)); }
    });
    row.append(label, rm);
    wrap.appendChild(row);
  }
}

async function onAddViewer() {
  const email = $("viewer-email").value.trim();
  if (!email) return;
  const role = $("viewer-role").value;
  try { await addViewer(email, role); $("viewer-email").value = ""; await renderViewers(); }
  catch (e) { alert(errorText(e)); }
}
```
In `refreshList`, after `renderVisibility();`, add `renderViewers();`. In `boot()`, add `$("add-viewer").addEventListener("click", onAddViewer);`.

- [ ] **Step 4: Guard + manual verify**

`node --test` stays green. Then in `/admin.html` (signed in as owner): the **Viewers** section lists `allowed_viewers`; add a friend email (role `friend`) → appears; remove → gone. (That friend can then sign in on the board and see everything.) Founder's browser step.

- [ ] **Step 5: Commit**

```bash
git add js/admin/store.js admin.html js/admin/ui.js
git commit -m "feat(admin): owner-only Viewers friend-management UI (D2b)"
```

---

## Task 5: README Google OAuth setup + final verification

**Files:** Modify `README.md`.

- [ ] **Step 1: Add a "Friends access (Google sign-in)" subsection to `README.md`**

Cover, in the README's voice: (a) **enable Google OAuth** — create a Google Cloud OAuth web client, set its authorized redirect URI to the Supabase auth callback (`https://<project>.supabase.co/auth/v1/callback`), then Supabase → Authentication → Providers → Google: enable + paste client id/secret; (b) add the site origins (localhost + the Pages domain) to Supabase → Authentication → URL Configuration → Redirect URLs; (c) **manage friends** in `/admin.html` → "Viewers" (owner adds their Google email as `friend`); (d) note the owner row is seeded via `db/friends-access.sql`; (e) reiterate this is now **RLS-enforced** (anon can't read private even via the API).

- [ ] **Step 2: Full test run** — `node --test`; record the count (expect the same green suite; D2b's only unit tests are Task 1's).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: Google OAuth / friends access setup (D2b)"
```

- [ ] **Step 4: Founder end-to-end checklist (manual, after enabling the Google provider)**

1. Anonymous board: DevTools Network shows **no** `esm.sh`/`supabase` request; "Sign in" chip present.
2. Sign in with your **owner** Google account → private regions/hikes appear; "Sign out" shows; Sign out → back to anon.
3. Add a friend's email in admin → Viewers; that friend signs in → sees everything.
4. A Google account **not** on the list → signs in, sees only public + the guest note.
5. Anon API still public-only (re-confirm D1/D2a held).

---

## Notes for the implementer
- **Dependency-free anon is the invariant:** `supabase-js` must load only through the lazy `import()` in `js/auth-public.js`, triggered by a sign-in click or `hasAuthRedirect()`/`hasStoredSession()`. Never static-import it in `index.html`/`main.js`/`trails.js`.
- **Only `js/data.js` (Task 1) is unit-tested.** Everything else is glue verified by serving the site; OAuth needs the Google provider enabled (Task 5) — code can be committed before that, but end-to-end sign-in can't be verified until it's on.
- **`showAll` = signed-in AND allowlisted.** A signed-in non-allowlisted user keeps `SHOW_ALL=false` (public view) + the guest note; RLS independently guarantees they only receive public rows.
- **Sign-out reloads** the page for a clean anonymous state (the OAuth flow is redirect-based, so full reloads are already the norm).
- **Deploy/push:** D2a + D2b commits are unpushed on `master`; push once D2b is built and you've enabled the Google provider + done the end-to-end check, so the whole friends feature deploys together.
```
