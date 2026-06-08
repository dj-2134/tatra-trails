// js/stats-format.js
// PURE display formatters for hike stats. Language-neutral (km/m/mi/ft/h/min/↑); `units`
// is "metric" | "imperial". Null / non-finite inputs → "" so callers can skip cleanly.
const M_PER_MILE = 1609.344;
const FT_PER_M = 3.28084;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// 1770 → "1,770". Deterministic, no locale dependency.
const groupThousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function formatDistance(m, units = "metric") {
  if (!isNum(m)) return "";
  return units === "imperial" ? `${(m / M_PER_MILE).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`;
}

export function formatAscent(m, units = "metric") {
  if (!isNum(m)) return "";
  return units === "imperial"
    ? `↑${groupThousands(Math.round(m * FT_PER_M))} ft`
    : `↑${Math.round(m)} m`;
}

// Units-independent (time is time).
export function formatDuration(min) {
  if (!isNum(min) || min < 0) return "";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
