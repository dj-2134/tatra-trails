// tests/status.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUSES, seasonalActive, adhocActive, computeStatus } from "../js/status.js";

const today = { mmdd: "06-05", iso: "2026-06-05" };

test("status values are open/closed/partial", () => {
  assert.deepEqual(STATUSES, ["open", "closed", "partial"]);
});

test("seasonalActive handles a year-wrapping window (Nov 1 - Jun 15)", () => {
  const s = { from: "11-01", to: "06-15" };
  assert.equal(seasonalActive(s, "10-31"), false);
  assert.equal(seasonalActive(s, "11-01"), true);
  assert.equal(seasonalActive(s, "01-15"), true);
  assert.equal(seasonalActive(s, "06-15"), true);
  assert.equal(seasonalActive(s, "06-16"), false);
});

test("seasonalActive handles a normal (non-wrapping) window", () => {
  const s = { from: "03-01", to: "03-31" };
  assert.equal(seasonalActive(s, "02-28"), false);
  assert.equal(seasonalActive(s, "03-15"), true);
  assert.equal(seasonalActive(s, "04-01"), false);
});

test("seasonalActive is false when there is no seasonal window", () => {
  assert.equal(seasonalActive(null, "06-05"), false);
  assert.equal(seasonalActive({ from: null, to: null }, "06-05"), false);
});

test("adhocActive: inclusive range, and null to_date means ongoing", () => {
  assert.equal(adhocActive({ from_date: "2026-06-01", to_date: "2026-06-10" }, "2026-06-05"), true);
  assert.equal(adhocActive({ from_date: "2026-06-06", to_date: "2026-06-10" }, "2026-06-05"), false);
  assert.equal(adhocActive({ from_date: "2026-06-01", to_date: "2026-06-04" }, "2026-06-05"), false);
  assert.equal(adhocActive({ from_date: "2026-06-01", to_date: null }, "2026-06-05"), true);
});

test("adhocActive: a missing/null from_date is never active", () => {
  assert.equal(adhocActive({ from_date: null, to_date: null }, "2026-06-05"), false);
  assert.equal(adhocActive({}, "2026-06-05"), false);
});

test("adhocActive: a missing to_date is treated as ongoing", () => {
  assert.equal(adhocActive({ from_date: "2026-06-01" }, "2026-06-05"), true);
});

test("computeStatus: no rules -> open", () => {
  assert.equal(computeStatus(null, [], today).status, "open");
});

test("computeStatus: active full seasonal -> closed", () => {
  const r = computeStatus({ from: "11-01", to: "06-15", partial: false }, [], today);
  assert.equal(r.status, "closed");
  assert.equal(r.activeClosures.length, 1);
});

test("computeStatus: active partial seasonal -> partial", () => {
  assert.equal(computeStatus({ from: "11-01", to: "06-15", partial: true }, [], today).status, "partial");
});

test("computeStatus: a full ad-hoc overrides a seasonally-open hike", () => {
  const r = computeStatus(null, [{ from_date: "2026-06-01", to_date: null, partial: false }], today);
  assert.equal(r.status, "closed");
});

test("computeStatus: precedence full > partial > open", () => {
  const seasonal = { from: "11-01", to: "06-15", partial: true };
  const adhoc = [{ from_date: "2026-06-01", to_date: null, partial: false }];
  assert.equal(computeStatus(seasonal, adhoc, today).status, "closed");
});

test("computeStatus: inactive ad-hoc does not affect an open hike", () => {
  const r = computeStatus(null, [{ from_date: "2026-04-01", to_date: "2026-04-10", partial: false }], today);
  assert.equal(r.status, "open");
  assert.equal(r.activeClosures.length, 0);
});
