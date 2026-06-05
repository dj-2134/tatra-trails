// js/trails.js — DOM/Leaflet orchestration (thin, impure binding around the pure modules).
import { fetchHikes } from "./data.js";
import { prepareHikes } from "./hikes.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
import { DICT, t } from "./i18n.js";

let MAP = null;
let HIKES = [];
let ROUTE_LAYER = null;
let SELECTED = null; // slug

function lang() {
  return document.documentElement.getAttribute("lang") === "sk" ? "sk" : "en";
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
  for (const hike of HIKES) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "hike-row";
    const name = document.createElement("span");
    name.textContent = hike.name[lang()] || hike.name.en;
    const badge = document.createElement("span");
    badge.className = `status-badge ${hike.status}`;
    badge.textContent = t(DICT, `status.${hike.status}`, lang());
    row.append(name, badge);
    row.addEventListener("click", () => select(hike.slug));
    list.appendChild(row);
  }
}

function select(slug) {
  SELECTED = slug;
  const hike = HIKES.find((h) => h.slug === slug);
  if (!hike) return;
  drawRoute(hike);
  openDetail(slug);
}

function drawRoute(hike) {
  if (ROUTE_LAYER) { MAP.removeLayer(ROUTE_LAYER); ROUTE_LAYER = null; }
  ROUTE_LAYER = L.geoJSON(hike.geometry, {
    style: { className: `trail trail--${hike.status}`, weight: 4 },
  }).addTo(MAP);
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
