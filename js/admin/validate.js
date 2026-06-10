// js/admin/validate.js
// PURE form validation mirroring db/schema.sql, for friendly client-side errors.
// The DB CHECK/NOT NULL/FK constraints remain the backstop. Self-contained: trims
// string fields itself, so whitespace-only input is treated as empty.

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MMDD_RE = /^[0-9]{2}-[0-9]{2}$/;
const ISO_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const str = (v) => (v == null ? "" : String(v)).trim();

// hike: { slug, name_en, name_sk, seasonal_from, seasonal_to, seasonal_partial,
//         note_en, note_sk, ref, geometry } -> string[] (empty = valid).
export function validateHike(hike) {
  const errs = [];
  const h = hike || {};
  const slug = str(h.slug);
  if (!slug || !SLUG_RE.test(slug)) errs.push("Slug is required and must be lowercase letters, numbers and hyphens.");
  if (!str(h.name_en)) errs.push("English name is required.");
  if (!str(h.name_sk)) errs.push("Slovak name is required.");
  const from = str(h.seasonal_from);
  const to = str(h.seasonal_to);
  if ((from === "") !== (to === "")) errs.push("Seasonal window needs both a from and a to date (or neither).");
  if (from && !MMDD_RE.test(from)) errs.push("Seasonal from must be MM-DD.");
  if (to && !MMDD_RE.test(to)) errs.push("Seasonal to must be MM-DD.");
  const g = h.geometry;
  if (!g || g.type !== "LineString" || !Array.isArray(g.coordinates) || g.coordinates.length < 2) {
    errs.push("A route is required — upload a GPX file.");
  }
  for (const [key, label] of [["distance_m", "Distance"], ["ascent_m", "Elevation gain"], ["duration_min", "Walking time"]]) {
    const v = h[key];
    if (v != null && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
      errs.push(`${label} must be a non-negative number.`);
    }
  }
  return errs;
}

// region selection: number[] -> string[]. At least one region membership is required.
export function validateRegionSelection(regionIds) {
  return Array.isArray(regionIds) && regionIds.length > 0
    ? []
    : ["Pick at least one region."];
}

// closure: { from_date, to_date, partial, reason_en, reason_sk, source } -> string[].
// ISO date strings compare lexicographically, so `<` is a valid ordering test.
export function validateClosure(closure) {
  const errs = [];
  const c = closure || {};
  const fromDate = str(c.from_date);
  const toDate = str(c.to_date);
  if (!fromDate || !ISO_RE.test(fromDate)) errs.push("Closure start date is required (YYYY-MM-DD).");
  if (toDate) {
    if (!ISO_RE.test(toDate)) errs.push("Closure end date must be YYYY-MM-DD.");
    else if (ISO_RE.test(fromDate) && toDate < fromDate) errs.push("Closure end date cannot be before the start date.");
  }
  if (!str(c.reason_en)) errs.push("English reason is required.");
  if (!str(c.reason_sk)) errs.push("Slovak reason is required.");
  return errs;
}
