// js/trails.js — DOM/Leaflet orchestration (thin, impure binding around the pure modules).
import { fetchHikes } from "./data.js";
import { prepareHikes } from "./hikes.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
import { DICT, t } from "./i18n.js";
import { routeLayer } from "./route-layer.js";
import { formatDistance, formatAscent, formatDuration } from "./stats-format.js";
import { BANDS, bandForDistance, formatBandRange } from "./bands.js";

let MAP = null;
let HIKES = [];
let ROUTE_LAYER = null;
let SELECTED = null; // slug

function lang() {
  return document.documentElement.getAttribute("lang") === "sk" ? "sk" : "en";
}

function units() {
  return document.documentElement.getAttribute("data-units") === "imperial" ? "imperial" : "metric";
}

// Compact list of the available stat strings, e.g. ["12.3 km", "↑540 m", "3 h 30 min"].
function statParts(hike) {
  const u = units();
  return [formatDistance(hike.distance_m, u), formatAscent(hike.ascent_m, u), formatDuration(hike.duration_min)]
    .filter(Boolean);
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

// Format a seasonal "MM-DD" as a localized short day/month (year is irrelevant).
function fmtMMDD(mmdd) {
  return new Date(`2000-${mmdd}T00:00:00`).toLocaleDateString(lang() === "sk" ? "sk-SK" : "en-GB", {
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
  document.addEventListener("tt:unitchange", () => {
    renderList();
    if (SELECTED) openDetail(SELECTED);
  });
}

function renderError() {
  const list = document.getElementById("hike-list");
  if (!list) return;
  list.innerHTML = "";
  const div = document.createElement("div");
  div.className = "disclaimer";
  div.textContent = t(DICT, "error.dataUnavailable", lang());
  list.appendChild(div);
}

function renderList() {
  const list = document.getElementById("hike-list");
  if (!list) return;
  list.innerHTML = "";
  const u = units();
  for (const band of BANDS) {
    const inBand = HIKES.filter((h) => bandForDistance(h.distance_m) === band.key);
    if (!inBand.length) continue;
    const group = document.createElement("details");
    group.className = "hike-group";
    group.dataset.band = band.key;
    const summary = document.createElement("summary");
    summary.textContent =
      `${t(DICT, `band.${band.key}`, lang())} · ${formatBandRange(band, u)} · ${inBand.length}`;
    group.appendChild(summary);
    for (const hike of inBand) group.appendChild(renderRow(hike));
    list.appendChild(group);
  }
  if (SELECTED) applySelection(SELECTED);
}

function renderRow(hike) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "hike-row";
  row.dataset.slug = hike.slug;

  const top = document.createElement("span");
  top.className = "hike-row-top";
  const name = document.createElement("span");
  name.textContent = hike.name[lang()] || hike.name.en;
  const badge = document.createElement("span");
  badge.className = `status-badge ${hike.status}`;
  badge.textContent = t(DICT, `status.${hike.status}`, lang());
  top.append(name, badge);
  row.appendChild(top);

  const parts = statParts(hike);
  if (parts.length) {
    const stats = document.createElement("span");
    stats.className = "hike-row-stats";
    stats.textContent = parts.join(" · ");
    row.appendChild(stats);
  }

  row.addEventListener("click", () => select(hike.slug));
  return row;
}

function select(slug) {
  SELECTED = slug;
  const hike = HIKES.find((h) => h.slug === slug);
  if (!hike) return;
  drawRoute(hike);
  applySelection(slug);
  openDetail(slug);
}

// Reflect the selected hike in the list: clear prior highlight, open its band group, highlight +
// scroll its row. Safe when the list is hidden (the detail is open) — visible on "← Back".
function applySelection(slug) {
  const list = document.getElementById("hike-list");
  if (!list) return;
  list.querySelectorAll(".hike-row.selected").forEach((el) => el.classList.remove("selected"));
  const row = list.querySelector(`.hike-row[data-slug="${slug}"]`);
  if (!row) return;
  row.classList.add("selected");
  const group = row.closest("details.hike-group");
  if (group) group.open = true;
  row.scrollIntoView({ block: "nearest" });
}

function drawRoute(hike) {
  if (ROUTE_LAYER) { MAP.removeLayer(ROUTE_LAYER); ROUTE_LAYER = null; }
  ROUTE_LAYER = routeLayer(hike.geometry, hike.status).addTo(MAP);
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

  const su = units();
  const statItems = [
    [t(DICT, "detail.distance", L_), formatDistance(hike.distance_m, su)],
    [t(DICT, "detail.ascent", L_), formatAscent(hike.ascent_m, su)],
    [t(DICT, "detail.walkingTime", L_), formatDuration(hike.duration_min)],
  ].filter(([, v]) => v);
  if (statItems.length) {
    const stats = document.createElement("div");
    stats.className = "detail-stats";
    for (const [label, value] of statItems) {
      const item = document.createElement("span");
      item.className = "detail-stat";
      const l = document.createElement("strong");
      l.textContent = `${label} `;
      item.append(l, document.createTextNode(value));
      stats.appendChild(item);
    }
    panel.appendChild(stats);
  }

  for (const c of hike.activeClosures) {
    const div = document.createElement("div");
    div.className = "closure";
    if (c.kind === "seasonal") {
      div.textContent = `${t(DICT, "detail.seasonal", L_)}: ${fmtMMDD(c.from)} – ${fmtMMDD(c.to)}`;
    } else {
      const range = c.to_date ? `${fmtDate(c.from_date)} – ${fmtDate(c.to_date)}` : `${fmtDate(c.from_date)} – ${t(DICT, "detail.ongoing", L_)}`;
      const reason = (L_ === "sk" ? c.reason_sk : c.reason_en) || c.reason_en || "";
      div.textContent = `${range}${reason ? " · " + reason : ""}`;
      if (c.source && /^https?:\/\//i.test(c.source)) {
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
