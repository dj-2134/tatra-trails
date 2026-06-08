import { resolveTheme, nextTheme } from "./theme.js";
import { DICT, t, DEFAULT_LANG, nextLang } from "./i18n.js";
import { resolveUnits, nextUnits } from "./units.js";

const THEME_KEY = "tt-theme";
const LANG_KEY = "tt-lang";
const UNITS_KEY = "tt-units";

export function initUi() {
  initTheme();
  initLang();
  initUnits();
}

/* ---- theme ---- */
function readStoredTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch { return null; }
}
function prefersDark() {
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}
function applyTheme(theme) {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
}
function initTheme() {
  let theme = resolveTheme({ stored: readStoredTheme(), prefersDark: prefersDark() });
  applyTheme(theme);
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      theme = nextTheme(theme);
      applyTheme(theme);
      try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
    });
  }
}

/* ---- language ---- */
function readStoredLang() {
  try {
    const l = localStorage.getItem(LANG_KEY);
    return l === "en" || l === "sk" ? l : DEFAULT_LANG;
  } catch { return DEFAULT_LANG; }
}
function applyLang(lang) {
  document.documentElement.setAttribute("lang", lang);
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const attr = el.getAttribute("data-i18n-attr");
    const value = t(DICT, key, lang);
    if (attr) el.setAttribute(attr, value);
    else el.textContent = value;
  });
}
function emitLangChange(lang) {
  document.dispatchEvent(new CustomEvent("tt:langchange", { detail: lang }));
}
function initLang() {
  let lang = readStoredLang();
  applyLang(lang);
  emitLangChange(lang);
  const btn = document.getElementById("lang-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      lang = nextLang(lang);
      applyLang(lang);
      try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
      emitLangChange(lang);
    });
  }
}

/* ---- units ---- */
function readStoredUnits() {
  try { return localStorage.getItem(UNITS_KEY); } catch { return null; }
}
function applyUnits(units) {
  document.documentElement.setAttribute("data-units", units);
  const btn = document.getElementById("units-toggle");
  if (btn) btn.textContent = units === "imperial" ? "mi" : "km";
}
function emitUnitChange(units) {
  document.dispatchEvent(new CustomEvent("tt:unitchange", { detail: units }));
}
function initUnits() {
  let units = resolveUnits(readStoredUnits());
  applyUnits(units);
  const btn = document.getElementById("units-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      units = nextUnits(units);
      applyUnits(units);
      try { localStorage.setItem(UNITS_KEY, units); } catch { /* ignore */ }
      emitUnitChange(units);
    });
  }
}
