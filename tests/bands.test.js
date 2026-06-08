// tests/bands.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { BANDS, bandForDistance, formatBandRange } from "../js/bands.js";

test("bandForDistance: half-open boundaries", () => {
  assert.equal(bandForDistance(0), "short");
  assert.equal(bandForDistance(4999), "short");
  assert.equal(bandForDistance(5000), "moderate");
  assert.equal(bandForDistance(9999), "moderate");
  assert.equal(bandForDistance(10000), "long");
  assert.equal(bandForDistance(14999), "long");
  assert.equal(bandForDistance(15000), "fullday");
  assert.equal(bandForDistance(99999), "fullday");
});

test("bandForDistance: non-finite/negative falls back to short", () => {
  assert.equal(bandForDistance(null), "short");
  assert.equal(bandForDistance(undefined), "short");
  assert.equal(bandForDistance(-10), "short");
});

const by = (k) => BANDS.find((b) => b.key === k);

test("formatBandRange: metric", () => {
  assert.equal(formatBandRange(by("short"), "metric"), "< 5 km");
  assert.equal(formatBandRange(by("moderate"), "metric"), "5–10 km");
  assert.equal(formatBandRange(by("long"), "metric"), "10–15 km");
  assert.equal(formatBandRange(by("fullday"), "metric"), "> 15 km");
});

test("formatBandRange: imperial", () => {
  assert.equal(formatBandRange(by("short"), "imperial"), "< 3.1 mi");
  assert.equal(formatBandRange(by("moderate"), "imperial"), "3.1–6.2 mi");
  assert.equal(formatBandRange(by("long"), "imperial"), "6.2–9.3 mi");
  assert.equal(formatBandRange(by("fullday"), "imperial"), "> 9.3 mi");
});
