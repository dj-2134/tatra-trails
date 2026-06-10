// tests/region-geo.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { representativePoints, nearestRegion, suggestRegions } from "../js/region-geo.js";

const regions = [
  { id: 1, slug: "vt", centroid_lon: 20.13, centroid_lat: 49.18 },
  { id: 2, slug: "mf", centroid_lon: 19.05, centroid_lat: 49.22 },
  { id: 3, slug: "nocentroid", centroid_lon: null, centroid_lat: null },
];

test("representativePoints: first, middle, last (deduped)", () => {
  const line = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]];
  assert.deepEqual(representativePoints(line), [[0, 0], [2, 2], [4, 4]]);
});

test("representativePoints: a loop (start==end) dedupes to 2 points", () => {
  const loop = [[0, 0], [1, 1], [0, 0]];
  assert.deepEqual(representativePoints(loop), [[0, 0], [1, 1]]);
});

test("representativePoints: empty / no usable points → []", () => {
  assert.deepEqual(representativePoints([]), []);
  assert.deepEqual(representativePoints([["x", "y"]]), []);
});

test("nearestRegion: picks the closest centroid, ignores centroid-less", () => {
  assert.equal(nearestRegion([20.1, 49.18], regions).slug, "vt");
  assert.equal(nearestRegion([19.06, 49.2], regions).slug, "mf");
});

test("nearestRegion: null when no region has a centroid", () => {
  assert.equal(nearestRegion([20, 49], [{ id: 9, centroid_lon: null, centroid_lat: null }]), null);
});

test("suggestRegions: in-range track → one id; traverse → two; deduped", () => {
  const inRange = [[20.10, 49.17], [20.13, 49.18], [20.16, 49.19]];
  assert.deepEqual(suggestRegions(inRange, regions), [1]);
  const traverse = [[19.05, 49.22], [19.6, 49.2], [20.13, 49.18]]; // MF … VT
  assert.deepEqual(suggestRegions(traverse, regions).sort(), [1, 2]);
});

test("suggestRegions: empty coords → []", () => {
  assert.deepEqual(suggestRegions([], regions), []);
});
