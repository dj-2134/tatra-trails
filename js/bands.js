// js/bands.js — PURE distance-band classification + range formatting. No DOM deps; unit-testable.
const M_PER_MILE = 1609.344;

// Ascending, half-open [minM, maxM). maxM null = open-ended (the last band).
export const BANDS = [
  { key: "short", minM: 0, maxM: 5000 },
  { key: "moderate", minM: 5000, maxM: 10000 },
  { key: "long", minM: 10000, maxM: 15000 },
  { key: "fullday", minM: 15000, maxM: null },
];

// Band key for a distance in meters. Non-finite/negative → "short" (never drop a hike).
export function bandForDistance(distanceM) {
  const d = Number(distanceM);
  if (!Number.isFinite(d) || d < 0) return "short";
  for (const b of BANDS) {
    if (d >= b.minM && (b.maxM == null || d < b.maxM)) return b.key;
  }
  return "fullday";
}

// One boundary in the active units: metric whole km (no decimals), imperial 1 decimal.
function boundary(meters, units) {
  return units === "imperial" ? (meters / M_PER_MILE).toFixed(1) : String(meters / 1000);
}

// Human range for a band, e.g. "< 5 km" / "5–10 km" / "> 15 km" (or mi). En dash separator.
export function formatBandRange(band, units = "metric") {
  const u = units === "imperial" ? "mi" : "km";
  if (band.minM === 0) return `< ${boundary(band.maxM, units)} ${u}`;
  if (band.maxM == null) return `> ${boundary(band.minM, units)} ${u}`;
  return `${boundary(band.minM, units)}–${boundary(band.maxM, units)} ${u}`;
}
