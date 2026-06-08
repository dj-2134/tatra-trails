// tests/stats-format.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDistance, formatAscent, formatDuration } from "../js/stats-format.js";

test("formatDistance: metric km and imperial miles, null → ''", () => {
  assert.equal(formatDistance(12300, "metric"), "12.3 km");
  assert.equal(formatDistance(12300, "imperial"), "7.6 mi");
  assert.equal(formatDistance(null), "");
});

test("formatAscent: ↑ prefix, metric m and imperial ft (grouped), null → ''", () => {
  assert.equal(formatAscent(540, "metric"), "↑540 m");
  assert.equal(formatAscent(540, "imperial"), "↑1,772 ft");
  assert.equal(formatAscent(null), "");
});

test("formatDuration: under an hour, exact hour, h+min, null → ''", () => {
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(120), "2 h");
  assert.equal(formatDuration(210), "3 h 30 min");
  assert.equal(formatDuration(null), "");
});
