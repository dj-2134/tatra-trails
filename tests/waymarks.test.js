// tests/waymarks.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { nearestPointIndex, segmentPolylines, closureStretch, closureMarkerPositions } from "../js/waymarks.js";

// A simple 5-vertex west→east line along latitude 49: indices 0..4 at lon 20.00..20.04.
const COORDS = [[20.00, 49], [20.01, 49], [20.02, 49], [20.03, 49], [20.04, 49]];
const GEOM = { type: "LineString", coordinates: COORDS };

test("nearestPointIndex: picks the closest vertex", () => {
  assert.equal(nearestPointIndex(COORDS, [20.0, 49]), 0);
  assert.equal(nearestPointIndex(COORDS, [20.021, 49.0001]), 2);
  assert.equal(nearestPointIndex(COORDS, [25, 50]), 4); // far away → nearest end
});

test("segmentPolylines: no segment data → one dashed none fallback over the whole line", () => {
  for (const segs of [null, undefined, [], "garbage"]) {
    const out = segmentPolylines(GEOM, segs);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0], { color: "none", style: "dashed", coords: COORDS });
  }
});

test("segmentPolylines: invalid geometry → empty array", () => {
  assert.deepEqual(segmentPolylines(null, [{ color: "red", style: "solid" }]), []);
  assert.deepEqual(segmentPolylines({ type: "LineString", coordinates: [[20, 49]] }, null), []);
});

test("segmentPolylines: splits share the boundary vertex", () => {
  const segs = [{ color: "blue", style: "solid", until: [20.02, 49] }, { color: "red", style: "solid" }];
  const out = segmentPolylines(GEOM, segs);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].coords, COORDS.slice(0, 3)); // 0,1,2
  assert.deepEqual(out[1].coords, COORDS.slice(2));    // 2,3,4 — vertex 2 shared
  assert.equal(out[0].color, "blue");
  assert.equal(out[1].color, "red");
});

test("segmentPolylines: anchors snapping out of order are re-sorted", () => {
  const segs = [
    { color: "blue", style: "solid", until: [20.03, 49] },  // snaps to 3
    { color: "red", style: "solid", until: [20.01, 49] },   // snaps to 1 — out of order
    { color: "green", style: "solid" },
  ];
  const out = segmentPolylines(GEOM, segs);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((s) => s.coords.length), [2, 3, 2]); // 0-1, 1-3, 3-4
});

test("segmentPolylines: zero-length slices are dropped", () => {
  const segs = [
    { color: "blue", style: "solid", until: [20.02, 49] },
    { color: "red", style: "solid", until: [20.0201, 49] }, // snaps to the same vertex 2
    { color: "green", style: "solid" },
  ];
  const out = segmentPolylines(GEOM, segs);
  assert.equal(out.length, 2); // the red zero-length slice is gone
  assert.deepEqual(out.map((s) => s.color), ["blue", "green"]);
});

test("segmentPolylines: normalization — unknown color→none, unknown style→solid, none forces dashed", () => {
  const out = segmentPolylines(GEOM, [{ color: "purple", style: "wavy" }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].color, "none");
  assert.equal(out[0].style, "dashed"); // none is ALWAYS dashed (overrides solid)
  const solidRed = segmentPolylines(GEOM, [{ color: "red", style: "wavy" }]);
  assert.equal(solidRed[0].style, "solid");
});

test("closureStretch: slices between anchors, reversed clicks normalized", () => {
  const fwd = closureStretch(GEOM, [20.01, 49], [20.03, 49]);
  assert.deepEqual(fwd, COORDS.slice(1, 4));
  const rev = closureStretch(GEOM, [20.03, 49], [20.01, 49]);
  assert.deepEqual(rev, COORDS.slice(1, 4)); // same stretch, regardless of click order
});

test("closureStretch: null on invalid input or same-vertex anchors", () => {
  assert.equal(closureStretch(null, [20.01, 49], [20.03, 49]), null);
  assert.equal(closureStretch(GEOM, null, [20.03, 49]), null);
  assert.equal(closureStretch(GEOM, [20.02, 49], [20.0201, 49]), null); // both snap to vertex 2
});

test("closureMarkerPositions: at least one marker (midpoint) for a short stretch", () => {
  const out = closureMarkerPositions(COORDS.slice(0, 2), { spacingM: 5000 });
  assert.equal(out.length, 1); // spacing larger than the stretch → midpoint only
});

test("closureMarkerPositions: spacing produces multiple markers, capped at 15", () => {
  // COORDS spans ~2.9 km; 400 m spacing → ~7 markers
  const out = closureMarkerPositions(COORDS, { spacingM: 400 });
  assert.ok(out.length >= 5 && out.length <= 9, `got ${out.length}`);
  for (const p of out) assert.ok(Array.isArray(p) && p.length === 2);
  const capped = closureMarkerPositions(COORDS, { spacingM: 1 });
  assert.equal(capped.length, 15); // hard cap
});

test("closureMarkerPositions: empty/short input → empty array", () => {
  assert.deepEqual(closureMarkerPositions(null), []);
  assert.deepEqual(closureMarkerPositions([[20, 49]]), []);
});
