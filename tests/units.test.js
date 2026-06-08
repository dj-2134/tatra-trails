// tests/units.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { UNITS, DEFAULT_UNITS, resolveUnits, nextUnits } from "../js/units.js";

test("units are metric/imperial, default metric", () => {
  assert.deepEqual(UNITS, ["metric", "imperial"]);
  assert.equal(DEFAULT_UNITS, "metric");
});

test("resolveUnits: a valid stored value wins, otherwise metric", () => {
  assert.equal(resolveUnits("imperial"), "imperial");
  assert.equal(resolveUnits("metric"), "metric");
  assert.equal(resolveUnits(null), "metric");
  assert.equal(resolveUnits("furlongs"), "metric");
});

test("nextUnits toggles", () => {
  assert.equal(nextUnits("metric"), "imperial");
  assert.equal(nextUnits("imperial"), "metric");
});
