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
  "legend.open": { en: "Open", sk: "Otvorené" },
  "legend.closed": { en: "Closed", sk: "Zatvorené" },
  "legend.partial": { en: "Partially closed", sk: "Čiastočne uzavreté" },
  "status.open": { en: "Open", sk: "Otvorené" },
  "status.closed": { en: "Closed", sk: "Zatvorené" },
  "status.partial": { en: "Partially closed", sk: "Čiastočne uzavreté" },
  "band.short": { en: "Short", sk: "Krátke" },
  "band.moderate": { en: "Moderate", sk: "Stredné" },
  "band.long": { en: "Long", sk: "Dlhé" },
  "band.fullday": { en: "Full-day", sk: "Celodenné" },
  "detail.back": { en: "← Back", sk: "← Späť" },
  "detail.seasonal": { en: "Seasonal closure", sk: "Sezónna uzávera" },
  "detail.ongoing": { en: "ongoing", sk: "trvá" },
  "detail.source": { en: "Source", sk: "Zdroj" },
  "detail.note": { en: "Note", sk: "Poznámka" },
  "detail.distance": { en: "Distance", sk: "Dĺžka" },
  "detail.ascent": { en: "Elevation gain", sk: "Prevýšenie" },
  "detail.walkingTime": { en: "Walking time", sk: "Čas" },
  "detail.parking": { en: "Parking near trailhead", sk: "Parkovanie pri štarte" },
  "marker.start": { en: "Start", sk: "Štart" },
  "marker.end": { en: "End", sk: "Cieľ" },
  "marker.startEnd": { en: "Start & finish", sk: "Štart a cieľ" },
  "detail.disclaimer": {
    en: "Awareness only. Always verify with TANAP / mountain rescue (HZS) before you go; the absence of a closure here is not a guarantee a trail is open or safe.",
    sk: "Len pre informáciu. Pred túrou si vždy overte stav u TANAP / Horskej záchrannej služby (HZS); chýbajúca uzávera tu neznamená, že chodník je otvorený alebo bezpečný.",
  },
  "error.dataUnavailable": {
    en: "Trail data is unavailable right now.",
    sk: "Údaje o chodníkoch nie sú momentálne dostupné.",
  },
  "search.noMatches": { en: "No matches", sk: "Žiadne výsledky" },
  "auth.signIn": { en: "Sign in", sk: "Prihlásiť sa" },
  "auth.signOut": { en: "Sign out", sk: "Odhlásiť sa" },
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
