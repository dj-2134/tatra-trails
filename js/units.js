// js/units.js — PURE units resolution (metric/imperial). No browser deps; mirrors theme.js.
export const UNITS = ["metric", "imperial"];
export const DEFAULT_UNITS = "metric";

export function resolveUnits(stored) {
  return UNITS.includes(stored) ? stored : DEFAULT_UNITS;
}

export function nextUnits(current) {
  return current === "imperial" ? "metric" : "imperial";
}
