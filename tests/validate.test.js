// tests/validate.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateHike, validateClosure, validateRegionSelection } from "../js/admin/validate.js";

const goodGeom = { type: "LineString", coordinates: [[20, 49], [20.1, 49.1]] };

test("validateHike accepts a complete hike (incl. year-wrapping seasonal window)", () => {
  assert.deepEqual(validateHike({
    slug: "strbske-popradske", name_en: "A", name_sk: "B",
    seasonal_from: "11-01", seasonal_to: "06-15", geometry: goodGeom,
  }), []);
});

test("validateHike requires slug, both names and a geometry", () => {
  const errs = validateHike({});
  assert.ok(errs.some((e) => /Slug/.test(e)));
  assert.ok(errs.some((e) => /English name/.test(e)));
  assert.ok(errs.some((e) => /Slovak name/.test(e)));
  assert.ok(errs.some((e) => /route is required/.test(e)));
});

test("validateHike rejects a half-filled seasonal window", () => {
  const errs = validateHike({ slug: "x", name_en: "A", name_sk: "B", seasonal_from: "11-01", geometry: goodGeom });
  assert.ok(errs.some((e) => /both a from and a to/.test(e)));
});

test("validateHike rejects a malformed slug and MM-DD", () => {
  const errs = validateHike({ slug: "Bad Slug", name_en: "A", name_sk: "B", seasonal_from: "1-1", seasonal_to: "2-2", geometry: goodGeom });
  assert.ok(errs.some((e) => /Slug/.test(e)));
  assert.ok(errs.some((e) => /MM-DD/.test(e)));
});

test("validateClosure requires from_date and both reasons", () => {
  const errs = validateClosure({});
  assert.ok(errs.some((e) => /start date is required/.test(e)));
  assert.ok(errs.some((e) => /English reason/.test(e)));
  assert.ok(errs.some((e) => /Slovak reason/.test(e)));
});

test("validateClosure rejects to_date before from_date", () => {
  const errs = validateClosure({ from_date: "2026-06-10", to_date: "2026-06-01", reason_en: "x", reason_sk: "y" });
  assert.ok(errs.some((e) => /cannot be before/.test(e)));
});

test("validateClosure accepts an ongoing closure (no to_date)", () => {
  assert.deepEqual(validateClosure({ from_date: "2026-06-01", reason_en: "x", reason_sk: "y" }), []);
});

test("validateHike treats whitespace-only required fields as empty", () => {
  const errs = validateHike({ slug: "x", name_en: "   ", name_sk: "  ", geometry: goodGeom });
  assert.ok(errs.some((e) => /English name/.test(e)));
  assert.ok(errs.some((e) => /Slovak name/.test(e)));
});

test("validateClosure treats whitespace-only reasons as empty and rejects a malformed to_date", () => {
  const errs = validateClosure({ from_date: "2026-06-01", to_date: "nope", reason_en: " ", reason_sk: " " });
  assert.ok(errs.some((e) => /English reason/.test(e)));
  assert.ok(errs.some((e) => /Slovak reason/.test(e)));
  assert.ok(errs.some((e) => /end date must be YYYY-MM-DD/.test(e)));
});

test("validators tolerate null/undefined input without throwing", () => {
  assert.ok(validateHike(null).length > 0);
  assert.ok(validateClosure(undefined).length > 0);
});

test("validateHike: stats are optional, reject negatives", () => {
  const base = { slug: "x", name_en: "A", name_sk: "B", geometry: goodGeom };
  assert.deepEqual(validateHike({ ...base, distance_m: 12300, ascent_m: 540, duration_min: 210 }), []);
  assert.deepEqual(validateHike(base), []); // all absent is fine
  assert.ok(validateHike({ ...base, distance_m: -5 }).some((e) => /Distance/.test(e)));
  assert.ok(validateHike({ ...base, ascent_m: -1 }).some((e) => /Elevation gain/.test(e)));
});

test("validateRegionSelection: >=1 id is valid", () => {
  assert.deepEqual(validateRegionSelection([1]), []);
  assert.deepEqual(validateRegionSelection([1, 2, 3]), []);
});

test("validateRegionSelection: empty / non-array is an error", () => {
  assert.equal(validateRegionSelection([]).length, 1);
  assert.equal(validateRegionSelection(null).length, 1);
  assert.equal(validateRegionSelection(undefined).length, 1);
});
