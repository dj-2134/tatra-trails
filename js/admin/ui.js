// js/admin/ui.js — admin page glue: wires auth + store + gpx + validate + status into the
// two-pane DOM. Thin/impure binding layer (manually verified), like trails.js in Phase 1.
import { getSession, sendMagicLink, signOut, onAuthChange } from "./auth.js";
import { listHikes, upsertHike, deleteHike, upsertClosure, deleteClosure } from "./store.js";
import { gpxToLineString } from "./gpx.js";
import { validateHike, validateClosure } from "./validate.js";
import { computeStatus } from "../status.js";

let HIKES = [];
let state = null; // editor state: { id, isNew, geometry, closures:[{...,_deleted?}] }

const $ = (id) => document.getElementById(id);

// Today in the Tatras' timezone, as status.js expects ({ iso, mmdd }).
function today() {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(new Date());
  return { iso, mmdd: iso.slice(5) };
}

// ---- view switching ----
function showLogin() { $("login-view").hidden = false; $("admin-view").hidden = true; $("sign-out").hidden = true; }
function showAdmin() { $("login-view").hidden = true; $("admin-view").hidden = false; $("sign-out").hidden = false; }

// ---- left pane ----
async function refreshList() {
  HIKES = await listHikes();
  const list = $("admin-hike-list");
  list.innerHTML = "";
  for (const h of HIKES) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "admin-hike-row";
    row.dataset.slug = h.slug;
    row.textContent = h.name_en || h.slug;
    row.addEventListener("click", () => { editHike(h); markSelected(h.slug); });
    list.appendChild(row);
  }
}

function markSelected(slug) {
  for (const row of $("admin-hike-list").children) {
    row.classList.toggle("selected", row.dataset.slug === slug);
  }
}

// ---- editor ----
function blankHike() {
  return { id: null, isNew: true, slug: "", name_en: "", name_sk: "",
    seasonal_from: "", seasonal_to: "", seasonal_partial: false,
    note_en: "", note_sk: "", ref: "", geometry: null, closures: [] };
}

function loadEditor(h) {
  state = h;
  $("editor-pane").hidden = false;
  $("editor-title").textContent = h.isNew ? "New hike" : (h.name_en || h.slug);
  $("f-slug").value = h.slug || "";
  $("f-slug").disabled = !h.isNew; // slug is the stable join key: read-only after create
  $("f-name-en").value = h.name_en || "";
  $("f-name-sk").value = h.name_sk || "";
  $("f-seasonal-from").value = h.seasonal_from || "";
  $("f-seasonal-to").value = h.seasonal_to || "";
  $("f-seasonal-partial").checked = !!h.seasonal_partial;
  $("f-note-en").value = h.note_en || "";
  $("f-note-sk").value = h.note_sk || "";
  $("f-ref").value = h.ref || "";
  $("f-gpx").value = "";
  $("f-geom-status").textContent = h.geometry ? `✓ ${h.geometry.coordinates.length} points` : "No route yet";
  $("delete-hike").hidden = h.isNew;
  $("editor-msg").textContent = "";
  renderClosures();
  updateBadge();
}

function newHike() { loadEditor(blankHike()); markSelected(null); }

function editHike(row) {
  loadEditor({
    id: row.id, isNew: false, slug: row.slug,
    name_en: row.name_en || "", name_sk: row.name_sk || "",
    seasonal_from: row.seasonal_from || "", seasonal_to: row.seasonal_to || "",
    seasonal_partial: !!row.seasonal_partial,
    note_en: row.note_en || "", note_sk: row.note_sk || "", ref: row.ref || "",
    geometry: row.geometry || null,
    closures: (row.closures || []).map((c) => ({ ...c })),
  });
}

// Live form values -> column-shaped hike (geometry comes from editor state, set on GPX upload).
function formToHike() {
  return {
    slug: $("f-slug").value.trim(),
    name_en: $("f-name-en").value.trim(),
    name_sk: $("f-name-sk").value.trim(),
    seasonal_from: $("f-seasonal-from").value.trim() || null,
    seasonal_to: $("f-seasonal-to").value.trim() || null,
    seasonal_partial: $("f-seasonal-partial").checked,
    note_en: $("f-note-en").value.trim() || null,
    note_sk: $("f-note-sk").value.trim() || null,
    ref: $("f-ref").value.trim() || null,
    geometry: state.geometry,
    updated_at: new Date().toISOString(),
  };
}

// ---- closures sub-section (inline add/edit/remove) ----
function renderClosures() {
  const wrap = $("closure-list");
  wrap.innerHTML = "";
  state.closures.forEach((c) => {
    if (c._deleted) return;
    const fs = document.createElement("fieldset");
    fs.className = "admin-closure";
    // Structure only — no user values interpolated (avoids quote-breakage/injection).
    fs.innerHTML = `
      <input data-k="from_date" type="date" title="From" />
      <input data-k="to_date" type="date" title="To (blank = ongoing)" />
      <label class="admin-check"><input data-k="partial" type="checkbox" /> Partial</label>
      <input data-k="reason_en" placeholder="Reason (EN)" />
      <input data-k="reason_sk" placeholder="Reason (SK)" />
      <input data-k="source" placeholder="Source URL" />
      <button type="button" class="chip admin-danger" data-remove="1" title="Remove">✕</button>`;
    fs.querySelectorAll("[data-k]").forEach((inp) => {
      const k = inp.getAttribute("data-k");
      if (inp.type === "checkbox") inp.checked = !!c[k];
      else inp.value = c[k] || "";
      inp.addEventListener("input", () => {
        c[k] = inp.type === "checkbox" ? inp.checked : inp.value;
        updateBadge();
      });
    });
    fs.querySelector("[data-remove]").addEventListener("click", () => { c._deleted = true; renderClosures(); updateBadge(); });
    wrap.appendChild(fs);
  });
}

function addClosure() {
  state.closures.push({ from_date: "", to_date: "", partial: false, reason_en: "", reason_sk: "", source: "" });
  renderClosures();
}

// ---- live status badge (reuses the tested pure status.js) ----
function updateBadge() {
  const from = $("f-seasonal-from").value.trim();
  const to = $("f-seasonal-to").value.trim();
  const seasonal = from && to ? { from, to, partial: $("f-seasonal-partial").checked } : null;
  const adhoc = state.closures
    .filter((c) => !c._deleted)
    .map((c) => ({ from_date: c.from_date || null, to_date: c.to_date || null, partial: !!c.partial }));
  const { status } = computeStatus(seasonal, adhoc, today());
  const badge = $("editor-status");
  badge.className = `status-badge ${status}`;
  badge.textContent = status;
}

// ---- GPX upload ----
async function onGpxChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    state.geometry = gpxToLineString(await file.text());
    $("f-geom-status").textContent = `✓ ${state.geometry.coordinates.length} points`;
  } catch (err) {
    $("f-geom-status").textContent = `GPX error: ${err.message}`; // geometry unchanged
  }
}

// ---- save / delete ----
function normalizeClosure(c) {
  const out = {
    from_date: c.from_date, to_date: c.to_date || null, partial: !!c.partial,
    reason_en: c.reason_en, reason_sk: c.reason_sk, source: c.source || null,
  };
  if (c.id) out.id = c.id;
  return out;
}

async function save() {
  const msg = $("editor-msg");
  const hike = formToHike();
  const live = state.closures.filter((c) => !c._deleted);
  const errs = validateHike(hike);
  for (const c of live) errs.push(...validateClosure(c));
  if (errs.length) { msg.textContent = errs[0]; return; } // validate before any request

  try {
    const saved = await upsertHike(hike);
    for (const c of state.closures) {
      if (c._deleted) { if (c.id) await deleteClosure(c.id); continue; }
      const savedC = await upsertClosure(saved.id, normalizeClosure(c));
      if (savedC && savedC.id) c.id = savedC.id; // capture id so a retry updates, not re-inserts
    }
    msg.textContent = "Saved.";
    await refreshList();
    const fresh = HIKES.find((h) => h.slug === saved.slug);
    if (fresh) { editHike(fresh); markSelected(fresh.slug); } // reload so ids + slug-lock are correct
  } catch (err) {
    msg.textContent = errorText(err); // non-destructive: form keeps its values
  }
}

async function remove() {
  if (!state.id) return;
  if (!window.confirm("Delete this hike and its closures?")) return;
  try {
    await deleteHike(state.id);
    $("editor-pane").hidden = true;
    await refreshList();
  } catch (err) {
    $("editor-msg").textContent = errorText(err);
  }
}

function errorText(err) {
  const m = (err && err.message) || String(err);
  if (/jwt|401|403|row-level|policy|permission/i.test(m)) return "Not authorized — sign in with the founder account.";
  return `Could not save: ${m}`;
}

// ---- boot ----
async function boot() {
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await sendMagicLink($("login-email").value.trim());
      $("login-msg").textContent = "Check your email for the sign-in link.";
    } catch (err) { $("login-msg").textContent = errorText(err); }
  });
  $("sign-out").addEventListener("click", async () => { await signOut(); showLogin(); });
  $("new-hike").addEventListener("click", newHike);
  $("add-closure").addEventListener("click", addClosure);
  $("save-hike").addEventListener("click", save);
  $("delete-hike").addEventListener("click", remove);
  $("f-gpx").addEventListener("change", onGpxChange);
  ["f-seasonal-from", "f-seasonal-to", "f-seasonal-partial"].forEach((id) => $(id).addEventListener("input", updateBadge));

  // onAuthChange fires with the INITIAL_SESSION on subscribe, and we also probe getSession()
  // explicitly; the `entered` guard makes refreshList run once per sign-in, not twice on boot.
  let entered = false;
  const enter = (session) => {
    if (session) { showAdmin(); if (!entered) { entered = true; refreshList(); } }
    else { entered = false; showLogin(); }
  };
  onAuthChange(enter);
  enter(await getSession());
}

boot();
