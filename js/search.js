// js/search.js — PURE hike name search. No DOM deps; unit-testable.

// NFD-decompose, strip combining diacritics, lowercase, trim — so "Štrbské" ~ "strbske".
export function normalizeText(s) {
  return String(s == null ? "" : s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

// Hikes whose EN or SK name contains the query (case- & diacritic-insensitive). Empty query → [].
export function searchHikes(hikes, query) {
  const q = normalizeText(query);
  if (!q) return [];
  return (hikes || []).filter((h) => {
    const en = normalizeText(h && h.name && h.name.en);
    const sk = normalizeText(h && h.name && h.name.sk);
    return en.includes(q) || sk.includes(q);
  });
}
