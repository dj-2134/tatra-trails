// Pure i18n — a {key:{en,sk}} dictionary + a lookup with fallback. No DOM deps.
export const LANGS = ["en", "sk"];
export const DEFAULT_LANG = "en";

export const DICT = {
  "app.title": { en: "TatraTrails", sk: "TatraTrails" },
  "search.placeholder": {
    en: "Search a place or trail…",
    sk: "Hľadať miesto alebo chodník…",
  },
  "panel.popularHikes": { en: "Popular hikes", sk: "Obľúbené túry" },
  "panel.planRoute": { en: "Plan a route", sk: "Naplánovať trasu" },
  "panel.comingSoon": { en: "Coming soon", sk: "Už čoskoro" },
  "legend.open": { en: "Open", sk: "Otvorené" },
  "legend.closed": { en: "Closed", sk: "Zatvorené" },
};

// Look up a key in `lang`; fall back to English, then to the key itself.
export function t(dict, key, lang = DEFAULT_LANG) {
  const entry = dict[key];
  if (!entry) return key;
  return entry[lang] ?? entry[DEFAULT_LANG] ?? key;
}

export function nextLang(current) {
  return current === "sk" ? "en" : "sk";
}
