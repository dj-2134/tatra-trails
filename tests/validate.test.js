// tests/validate.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateHike, validateClosure } from "../js/admin/validate.js";

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
