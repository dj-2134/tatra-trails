// tests/stats.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineDistanceMeters, estimateDurationMin } from "../js/stats.js";

test("lineDistanceMeters: 1° of latitude is ~111.2 km", () => {
  const d = lineDistanceMeters([[20, 49], [20, 50]]);
  assert.ok(Math.abs(d - 111195) < 500, `got ${d}`);
});

test("lineDistanceMeters: sums consecutive segments", () => {
  const d = lineDistanceMeters([[20, 49], [20, 49.5], [20, 50]]);
  assert.ok(Math.abs(d - 111195) < 1000, `got ${d}`);
});

test("lineDistanceMeters: fewer than 2 points is 0", () => {
  assert.equal(lineDistanceMeters([]), 0);
  assert.equal(lineDistanceMeters([[20, 49]]), 0);
  assert.equal(lineDistanceMeters(null), 0);
});

test("estimateDurationMin: 10 km + 600 m ascent = 180 min (Naismith)", () => {
  assert.equal(estimateDurationMin(10000, 600), 180);
});

test("estimateDurationMin: flat 10 km = 120 min; null ascent counts as flat", () => {
  assert.equal(estimateDurationMin(10000, 0), 120);
  assert.equal(estimateDurationMin(10000, null), 120);
});
