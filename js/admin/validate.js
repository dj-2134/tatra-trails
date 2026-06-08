// js/admin/validate.js
// PURE form validation mirroring db/schema.sql, for friendly client-side errors.
// The DB CHECK/NOT NULL/FK constraints remain the backstop.

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MMDD_RE = /^[0-9]{2}-[0-9]{2}$/;
const ISO_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

// hike: { slug, name_en, name_sk, seasonal_from, seasonal_to, seasonal_partial,
//         note_en, note_sk, ref, geometry } -> string[] (empty = valid).
export function validateHike(hike) {
  const errs = [];
  const h = hike || {};
  if (!h.slug || !SLUG_RE.test(h.slug)) errs.push("Slug is required and must be lowercase letters, numbers and hyphens.");
  if (!h.name_en) errs.push("English name is required.");
  if (!h.name_sk) errs.push("Slovak name is required.");
  const from = h.seasonal_from || "";
  const to = h.seasonal_to || "";
  if ((from === "") !== (to === "")) errs.push("Seasonal window needs both a from and a to date (or neither).");
  if (from && !MMDD_RE.test(from)) errs.push("Seasonal from must be MM-DD.");
  if (to && !MMDD_RE.test(to)) errs.push("Seasonal to must be MM-DD.");
  const g = h.geometry;
  if (!g || g.type !== "LineString" || !Array.isArray(g.coordinates) || g.coordinates.length < 2) {
    errs.push("A route is required — upload a GPX file.");
  }
  return errs;
}

// closure: { from_date, to_date, partial, reason_en, reason_sk, source } -> string[].
export function validateClosure(closure) {
  const errs = [];
  const c = closure || {};
  if (!c.from_date || !ISO_RE.test(c.from_date)) errs.push("Closure start date is required (YYYY-MM-DD).");
  if (c.to_date) {
    if (!ISO_RE.test(c.to_date)) errs.push("Closure end date must be YYYY-MM-DD.");
    else if (c.from_date && c.to_date < c.from_date) errs.push("Closure end date cannot be before the start date.");
  }
  if (!c.reason_en) errs.push("English reason is required.");
  if (!c.reason_sk) errs.push("Slovak reason is required.");
  return errs;
}
