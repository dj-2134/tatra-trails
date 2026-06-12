// js/admin/ui.js — admin page glue: wires auth + store + gpx + validate + status into the
// two-pane DOM. Thin/impure binding layer (manually verified), like trails.js in Phase 1.
import { getSession, sendMagicLink, signOut, onAuthChange } from "./auth.js";
import { listHikes, upsertHike, deleteHike, upsertClosure, deleteClosure,
         listRegions, setHikeRegions, setRegionPublic,
         listViewers, addViewer, removeViewer, isOwner } from "./store.js";
import { gpxToLineString, gpxStats, gpxName } from "./gpx.js";
import { validateHike, validateClosure, validateRegionSelection } from "./validate.js";
import { suggestRegions } from "../region-geo.js";
import { normalizeText } from "../search.js";
import { computeStatus } from "../status.js";
import { initMap } from "../map.js";
import { routeLayer } from "../route-layer.js";
import { nearestPointIndex } from "../waymarks.js";
import { estimateDurationMin } from "../stats.js";

let HIKES = [];
let REGIONS = [];
let state = null; // editor state: { id, isNew, geometry, closures:[{...,_deleted?}] }
let ADMIN_MAP = null;
let ADMIN_ROUTE = null;
let MARK_MODE = null;   // null | "split" | { type: "extent", write: (from, to) => void, clicks: [] }
let ANCHOR_DOTS = null; // L.layerGroup of split/extent dots over the route

const $ = (id) => document.getElementById(id);

// Today in the Tatras' timezone, as status.js expects ({ iso, mmdd }).
function today() {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(new Date());
  return { iso, mmdd: iso.slice(5) };
}

// ---- view switching ----
function showLogin() {
  $("login-view").hidden = false; $("admin-view").hidden = true; $("sign-out").hidden = true;
  $("admin-hike-list").innerHTML = ""; $("editor-pane").hidden = true; // drop any signed-in content
}
function showAdmin() { $("login-view").hidden = true; $("admin-view").hidden = false; $("sign-out").hidden = false; }
// Signed in, but not the owner: hide the admin UI, show a message + sign-out (so they can switch accounts).
function showNotOwner() {
  $("login-view").hidden = false; $("admin-view").hidden = true; $("sign-out").hidden = false;
  $("admin-hike-list").innerHTML = ""; $("editor-pane").hidden = true;
  $("login-msg").textContent = "This account isn't the owner. Sign out and use the owner account.";
}

// ---- left pane ----
async function refreshList() {
  HIKES = await listHikes();
  REGIONS = await listRegions();
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
  renderRegionPicker();
  renderVisibility();
  renderViewers();
}

function markSelected(slug) {
  for (const row of $("admin-hike-list").children) {
    row.classList.toggle("selected", row.dataset.slug === slug);
  }
}

// ---- region multi-select ----
function renderRegionPicker() {
  const list = $("f-region-list");
  if (!list) return;
  list.innerHTML = "";
  for (const r of REGIONS) {
    const label = document.createElement("label");
    label.dataset.norm = normalizeText(`${r.name_en} ${r.name_sk}`);
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = String(r.id);
    label.append(cb, document.createTextNode(` ${r.name_en}${r.kraj ? ` (${r.kraj})` : ""}`));
    list.appendChild(label);
  }
  $("f-region-filter").value = "";
}

function filterRegionPicker(q) {
  const norm = normalizeText(q);
  for (const label of $("f-region-list").children) {
    label.classList.toggle("hidden", norm !== "" && !label.dataset.norm.includes(norm));
  }
}

function getSelectedRegionIds() {
  return [...$("f-region-list").querySelectorAll("input:checked")].map((cb) => Number(cb.value));
}

function setSelectedRegionIds(ids) {
  const want = new Set((ids || []).map(Number));
  for (const cb of $("f-region-list").querySelectorAll("input[type=checkbox]")) {
    cb.checked = want.has(Number(cb.value));
  }
}

// ---- per-region public/private toggles (populated regions only) ----
function renderVisibility() {
  const wrap = $("region-visibility-list");
  if (!wrap) return;
  wrap.innerHTML = "";
  const populated = new Set(HIKES.flatMap((h) => (h.hike_regions || []).map((x) => x.region_id)));
  for (const r of REGIONS) {
    if (!populated.has(r.id)) continue;
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!r.is_public;
    cb.addEventListener("change", async () => {
      try { await setRegionPublic(r.id, cb.checked); r.is_public = cb.checked; }
      catch (err) { cb.checked = !cb.checked; alert(errorText(err)); }
    });
    label.append(cb, document.createTextNode(` ${r.name_en}`));
    wrap.appendChild(label);
  }
}

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
    row.append(label);
    if (v.role === "owner") {
      // Owners are not removable from the UI (avoids accidental lockout) — manage owners via SQL.
      const lock = document.createElement("span");
      lock.className = "admin-viewer-owner";
      lock.textContent = "owner";
      lock.title = "Owner — manage via SQL to avoid accidental lockout";
      row.append(lock);
    } else {
      const rm = document.createElement("button");
      rm.type = "button"; rm.className = "viewer-remove"; rm.textContent = "✕"; rm.title = `Remove ${v.email}`;
      rm.addEventListener("click", async () => {
        try { await removeViewer(v.email); await renderViewers(); }
        catch (e) { alert(errorText(e)); }
      });
      row.append(rm);
    }
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

// ---- editor ----
function blankHike() {
  return { id: null, isNew: true, slug: "", name_en: "", name_sk: "",
    seasonal_from: "", seasonal_to: "", seasonal_partial: false,
    note_en: "", note_sk: "", ref: "", geometry: null, closures: [],
    distance_m: null, ascent_m: null, duration_min: null, region_ids: [],
    is_public: true,
    waymark_segments: null, seasonal_extent_from: null, seasonal_extent_to: null };
}

function loadEditor(h) {
  MARK_MODE = null;
  state = h;
  $("editor-pane").hidden = false;
  $("editor-title").textContent = h.isNew ? "New hike" : (h.name_en || h.slug);
  $("f-slug").value = h.slug || "";
  $("f-slug").disabled = !h.isNew; // slug is the stable join key: read-only after create
  $("f-name-en").value = h.name_en || "";
  $("f-name-sk").value = h.name_sk || "";
  $("f-public").checked = h.is_public !== false;
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
  renderWaymarks();
  renderSeasonalExtent();
  setSelectedRegionIds(h.region_ids || []);
  $("f-region-filter").value = "";
  filterRegionPicker("");
  updateBadge();
  $("f-distance").value = h.distance_m != null ? (h.distance_m / 1000).toFixed(1) : "";
  $("f-ascent").value = h.ascent_m != null ? h.ascent_m : "";
  setDurationFields(h.duration_min ?? null);
  $("f-stats-hint").textContent = "";
  ensureMap();
  drawAdminRoute(h.geometry);
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
    distance_m: row.distance_m ?? null, ascent_m: row.ascent_m ?? null, duration_min: row.duration_min ?? null,
    region_ids: (row.hike_regions || []).map((x) => x.region_id),
    is_public: row.is_public !== false,
    waymark_segments: row.waymark_segments ?? null,
    seasonal_extent_from: row.seasonal_extent_from ?? null,
    seasonal_extent_to: row.seasonal_extent_to ?? null,
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
    distance_m: numOrNull($("f-distance").value) != null ? Math.round(numOrNull($("f-distance").value) * 1000) : null,
    ascent_m: numOrNull($("f-ascent").value) != null ? Math.round(numOrNull($("f-ascent").value)) : null,
    duration_min: durationFromFields(),
    is_public: $("f-public").checked,
    updated_at: new Date().toISOString(),
    waymark_segments: state.waymark_segments,
    seasonal_extent_from: state.seasonal_extent_from ?? null,
    seasonal_extent_to: state.seasonal_extent_to ?? null,
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
        redrawPreview();
      });
    });
    fs.querySelector("[data-remove]").addEventListener("click", () => { c._deleted = true; renderClosures(); updateBadge(); redrawPreview(); });
    wrap.appendChild(fs);
  });
}

function addClosure() {
  state.closures.push({ from_date: "", to_date: "", partial: false, reason_en: "", reason_sk: "", source: "" });
  renderClosures();
}

// ---- waymarks editor (Increment F) ----
const WM_COLORS = ["red", "blue", "green", "yellow", "none"];

function segsForEdit() {
  return Array.isArray(state.waymark_segments) && state.waymark_segments.length
    ? state.waymark_segments
    : [{ color: "none", style: "dashed" }];
}

function renderWaymarks() {
  const wrap = $("wm-seg-list");
  wrap.innerHTML = "";
  const segs = segsForEdit();
  segs.forEach((seg, i) => {
    const row = document.createElement("div");
    row.className = "admin-wm-row";
    const colorSel = document.createElement("select");
    for (const c of WM_COLORS) {
      const o = document.createElement("option");
      o.value = c; o.textContent = c === "none" ? "unmarked" : c;
      colorSel.appendChild(o);
    }
    colorSel.value = WM_COLORS.includes(seg.color) ? seg.color : "none";
    const styleSel = document.createElement("select");
    for (const s of ["solid", "dashed"]) {
      const o = document.createElement("option");
      o.value = s; o.textContent = s;
      styleSel.appendChild(o);
    }
    const syncStyle = () => {
      if (colorSel.value === "none") { styleSel.value = "dashed"; styleSel.disabled = true; }
      else styleSel.disabled = false;
    };
    styleSel.value = seg.style === "dashed" ? "dashed" : "solid";
    syncStyle();
    colorSel.addEventListener("change", () => {
      syncStyle();
      const s = materialize()[i]; s.color = colorSel.value; if (colorSel.value === "none") s.style = "dashed";
      redrawPreview();
    });
    styleSel.addEventListener("change", () => { materialize()[i].style = styleSel.value; redrawPreview(); });
    row.append(`#${i + 1} `, colorSel, styleSel);
    if (seg.until) {
      const rm = document.createElement("button");
      rm.type = "button"; rm.className = "chip admin-danger"; rm.textContent = "✕ split";
      rm.title = "Remove this split (merges with the next segment)";
      rm.addEventListener("click", () => {
        const arr = materialize();
        arr.splice(i, 1);
        redrawPreview(); renderWaymarks();
      });
      row.append(rm);
    }
    wrap.appendChild(row);
  });
}

// Editing materializes the default single segment into real state.
function materialize() {
  if (!Array.isArray(state.waymark_segments) || !state.waymark_segments.length) {
    state.waymark_segments = [{ color: "none", style: "dashed" }];
  }
  return state.waymark_segments;
}

function armSplit() {
  MARK_MODE = MARK_MODE === "split" ? null : "split";
  $("wm-hint").textContent = MARK_MODE === "split" ? "Click the route where the marking changes…" : "";
  $("wm-add-split").classList.toggle("armed", MARK_MODE === "split");
  redrawPreview();
}

function resetWaymarks() {
  state.waymark_segments = null;
  MARK_MODE = null;
  $("wm-hint").textContent = "";
  $("wm-add-split").classList.remove("armed");
  renderWaymarks(); redrawPreview();
}

function applySplitClick(snapIdx) {
  const coords = state.geometry.coordinates;
  const arr = materialize();
  // Which segment contains snapIdx? Walk the same way segmentPolylines does.
  const endIdx = (seg) => (seg.until ? nearestPointIndex(coords, seg.until) : coords.length - 1);
  let from = 0;
  let inserted = false;
  for (let i = 0; i < arr.length; i++) {
    const end = endIdx(arr[i]);
    if (snapIdx > from && snapIdx < end) {
      // split segment i at snapIdx: first half keeps colour/style and gets the new anchor
      arr.splice(i, 0, { color: arr[i].color, style: arr[i].style, until: coords[snapIdx] });
      inserted = true;
      break;
    }
    from = Math.max(end, from);
  }
  if (!inserted) {
    $("wm-hint").textContent = "Can't split there — click between the route ends, away from existing splits.";
    redrawPreview();
    return;
  }
  MARK_MODE = null;
  $("wm-add-split").classList.remove("armed");
  $("wm-hint").textContent = "";
  renderWaymarks(); redrawPreview();
}

function onPreviewClick(e) {
  if (!MARK_MODE || !state || !state.geometry) return;
  const clicked = [e.latlng.lng, e.latlng.lat];
  const idx = nearestPointIndex(state.geometry.coordinates, clicked);
  const snapped = state.geometry.coordinates[idx];
  if (MARK_MODE === "split") { applySplitClick(idx); return; }
  if (MARK_MODE.type === "extent") {
    MARK_MODE.clicks.push(snapped);
    if (MARK_MODE.clicks.length === 2) {
      MARK_MODE.write(MARK_MODE.clicks[0], MARK_MODE.clicks[1]);
      MARK_MODE = null;
      $("wm-hint").textContent = "";
      renderClosures(); renderSeasonalExtent(); redrawPreview();
    } else {
      $("wm-hint").textContent = "Now click where the closed part ends…";
      redrawPreview(); // shows the first dot
    }
  }
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

// Stub — Task 9 replaces this with the seasonal-extent extent-click UI.
function renderSeasonalExtent() {}

// ---- map preview ----
function ensureMap() {
  if (!ADMIN_MAP) {
    ADMIN_MAP = initMap("admin-map");
    ADMIN_MAP.on("click", onPreviewClick);
  }
  ADMIN_MAP.invalidateSize(); // the editor pane was hidden until now
}

// Active closures from the LIVE form (same inputs as updateBadge), annotated for ✕ markers.
function liveClosuresForMap() {
  const from = $("f-seasonal-from").value.trim();
  const to = $("f-seasonal-to").value.trim();
  const seasonal = from && to
    ? { from, to, partial: $("f-seasonal-partial").checked,
        extent_from: state.seasonal_extent_from ?? null, extent_to: state.seasonal_extent_to ?? null }
    : null;
  const adhoc = state.closures.filter((c) => !c._deleted)
    .map((c) => ({ from_date: c.from_date || null, to_date: c.to_date || null, partial: !!c.partial,
      extent_from: c.extent_from || null, extent_to: c.extent_to || null }));
  return computeStatus(seasonal, adhoc, today()).activeClosures
    .map((c) => ({ ...c, label: c.kind === "seasonal" ? "Seasonal closure" : "Closure" }));
}

function redrawPreview() {
  if (!state) return;
  drawAdminRoute(state.geometry, { fit: false });
}

function drawAdminRoute(geometry, { fit = true } = {}) {
  if (ADMIN_ROUTE) { ADMIN_MAP.removeLayer(ADMIN_ROUTE); ADMIN_ROUTE = null; }
  if (ANCHOR_DOTS) { ADMIN_MAP.removeLayer(ANCHOR_DOTS); ANCHOR_DOTS = null; }
  $("admin-map").classList.toggle("marking", !!MARK_MODE);
  if (!geometry || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return;
  ADMIN_ROUTE = routeLayer(geometry, {
    segments: state ? state.waymark_segments : null,
    closures: state ? liveClosuresForMap() : [],
    dim: !!MARK_MODE,
  }).addTo(ADMIN_MAP);
  ANCHOR_DOTS = L.layerGroup(anchorDots()).addTo(ADMIN_MAP);
  if (!fit) return;
  const b = ADMIN_ROUTE.getBounds();
  if (b.isValid()) ADMIN_MAP.fitBounds(b, { padding: [30, 30] });
}

// Small full-opacity dots: every split anchor + the pending first extent click.
function anchorDots() {
  const dots = [];
  const dot = ([lon, lat]) => L.circleMarker([lat, lon],
    { radius: 5, color: "#fff", weight: 2, fillColor: "#1565c0", fillOpacity: 1 });
  for (const seg of state.waymark_segments || []) {
    if (Array.isArray(seg.until)) dots.push(dot(seg.until));
  }
  if (MARK_MODE && MARK_MODE.type === "extent") for (const c of MARK_MODE.clicks) dots.push(dot(c));
  return dots;
}

// ---- stat-field helpers ----
function setDurationFields(min) {
  if (min == null) { $("f-dur-h").value = ""; $("f-dur-min").value = ""; return; }
  $("f-dur-h").value = Math.floor(min / 60);
  $("f-dur-min").value = Math.round(min % 60);
}
function durationFromFields() {
  const h = parseInt($("f-dur-h").value, 10);
  const m = parseInt($("f-dur-min").value, 10);
  if (!Number.isFinite(h) && !Number.isFinite(m)) return null;
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
function numOrNull(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }

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

// ---- GPX upload ----
async function onGpxChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    state.geometry = gpxToLineString(text);
    const { distanceM, ascentM } = gpxStats(text);
    $("f-distance").value = (distanceM / 1000).toFixed(1);
    $("f-ascent").value = ascentM != null ? ascentM : "";
    setDurationFields(estimateDurationMin(distanceM, ascentM));
    $("f-geom-status").textContent = `✓ ${state.geometry.coordinates.length} points`;
    $("f-stats-hint").textContent = "auto-filled from GPX — edit if needed";
    drawAdminRoute(state.geometry);
    const suggested = suggestRegions(state.geometry.coordinates, REGIONS);
    if (suggested.length) setSelectedRegionIds(suggested);
    const gname = gpxName(text);
    if (gname && !$("f-name-sk").value.trim()) $("f-name-sk").value = gname;
  } catch (err) {
    $("f-geom-status").textContent = `GPX error: ${err.message}`; // geometry + fields unchanged
  }
}

// ---- save / delete ----
function normalizeClosure(c) {
  const out = {
    from_date: c.from_date, to_date: c.to_date || null, partial: !!c.partial,
    reason_en: c.reason_en, reason_sk: c.reason_sk, source: c.source || null,
    extent_from: c.extent_from || null, extent_to: c.extent_to || null,
  };
  if (c.id) out.id = c.id;
  return out;
}

async function save() {
  const msg = $("editor-msg");
  const hike = formToHike();
  const regionIds = getSelectedRegionIds();
  const live = state.closures.filter((c) => !c._deleted);
  const errs = validateHike(hike);
  for (const c of live) errs.push(...validateClosure(c));
  errs.push(...validateRegionSelection(regionIds));
  if (errs.length) { msg.textContent = errs[0]; return; } // validate before any request

  try {
    const saved = await upsertHike(hike);
    for (const c of state.closures) {
      if (c._deleted) { if (c.id) await deleteClosure(c.id); continue; }
      const savedC = await upsertClosure(saved.id, normalizeClosure(c));
      if (savedC && savedC.id) c.id = savedC.id; // capture id so a retry updates, not re-inserts
    }
    await setHikeRegions(saved.id, regionIds);
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
  if (/jwt|401|403|row-level|policy|permission/i.test(m)) return "Not authorized — sign in with the owner account.";
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
  $("copy-arrow").addEventListener("click", copyArrow);
  $("f-region-filter").addEventListener("input", (e) => filterRegionPicker(e.target.value));
  $("add-viewer").addEventListener("click", onAddViewer);
  $("wm-add-split").addEventListener("click", armSplit);
  $("wm-reset").addEventListener("click", resetWaymarks);
  ["f-seasonal-from", "f-seasonal-to", "f-seasonal-partial"].forEach((id) =>
    $(id).addEventListener("input", () => { updateBadge(); redrawPreview(); }));

  // onAuthChange fires with the INITIAL_SESSION on subscribe, and we also probe getSession()
  // explicitly; the `entered` guard makes refreshList run once per sign-in, not twice on boot.
  let entered = false;
  const enter = async (session) => {
    if (!session) { entered = false; showLogin(); return; }
    // Admin UI is owner-only. Reads/writes are RLS-guarded regardless, but don't show the editor chrome
    // to a signed-in friend / non-owner.
    let owner = false;
    try { owner = await isOwner(); } catch (e) { owner = false; }
    if (owner) { showAdmin(); if (!entered) { entered = true; refreshList(); } }
    else { entered = false; showNotOwner(); }
  };
  onAuthChange((session) => { enter(session); });
  enter(await getSession());
}

boot();
