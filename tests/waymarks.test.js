// tests/waymarks.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { nearestPointIndex, snapCandidates, snapAnchorIndex, segmentPolylines, closureStretch, closureMarkerPositions, swatchList } from "../js/waymarks.js";

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

test("closureMarkerPositions: a long edge spanning several intervals emits its vertex once", () => {
  const twoPoint = [[20.00, 49], [20.01, 49]]; // single ~730 m edge
  const out = closureMarkerPositions(twoPoint, { spacingM: 100 });
  assert.equal(out.length, 1); // NOT 7 duplicates of the same vertex
});

test("closureMarkerPositions: spacing produces multiple deduplicated markers, capped at 15", () => {
  // COORDS spans ~2.9 km with ~730 m edges; 400 m spacing → one marker per vertex crossed
  const out = closureMarkerPositions(COORDS, { spacingM: 400 });
  assert.ok(out.length >= 3 && out.length <= 7, `got ${out.length}`);
  for (const p of out) assert.ok(Array.isArray(p) && p.length === 2);
  for (let i = 1; i < out.length; i++) assert.notDeepEqual(out[i], out[i - 1]); // no stacked markers
  // dense 40-vertex line (~73 m edges): 1 m spacing wants a marker at every vertex → hard cap 15
  const dense = Array.from({ length: 40 }, (_, i) => [20 + i * 0.001, 49]);
  const capped = closureMarkerPositions(dense, { spacingM: 1 });
  assert.equal(capped.length, 15);
});

test("closureMarkerPositions: empty/short input → empty array", () => {
  assert.deepEqual(closureMarkerPositions(null), []);
  assert.deepEqual(closureMarkerPositions([[20, 49]]), []);
});

test("swatchList: dedupes repeats but keeps route order of distinct pairs", () => {
  const segs = [
    { color: "green", style: "solid", until: [20.01, 49] },
    { color: "green", style: "dashed", until: [20.02, 49] },
    { color: "green", style: "solid", until: [20.03, 49] },
    { color: "none", style: "solid" }, // normalizes to none+dashed
  ];
  assert.deepEqual(swatchList(segs), [
    { color: "green", style: "solid" },
    { color: "green", style: "dashed" },
    { color: "none", style: "dashed" },
  ]);
});

test("swatchList: empty/invalid input → empty array", () => {
  assert.deepEqual(swatchList(null), []);
  assert.deepEqual(swatchList([]), []);
});

// ---- Lollipop fixture ----
// Stem out:  indices 0,1,2  at [20.00,49], [20.005,49], [20.01,49]
// Loop:      indices 3,4,5  at [20.012,49.002], [20.015,49.0], [20.012,48.998]
// Stem back: indices 6,7,8  at [20.01,49], [20.005,49], [20.00,49]  (reversed stem)
// So index 6 has same coords as index 2; index 7 same as 1; index 8 same as 0.
const STEM = [[20.00, 49], [20.005, 49], [20.01, 49]];
const LOOP = [[20.012, 49.002], [20.015, 49.0], [20.012, 48.998]];
const LOLLI = {
  type: "LineString",
  coordinates: [...STEM, ...LOOP, ...[...STEM].reverse()],
};
// LOLLI.coordinates indices:
//  0=[20.00,49]      (stem start)
//  1=[20.005,49]     (stem mid out)
//  2=[20.01,49]      (stem/loop junction out)
//  3=[20.012,49.002] (loop turn 1)
//  4=[20.015,49.0]   (loop far)
//  5=[20.012,48.998] (loop turn 2)
//  6=[20.01,49]      (stem/loop junction back — same coord as 2)
//  7=[20.005,49]     (stem mid back — same coord as 1)
//  8=[20.00,49]      (stem end — same coord as 0)

test("snapCandidates: lollipop stem-mid point yields two candidates (one per pass)", () => {
  const coords = LOLLI.coordinates;
  // [20.005,49] is exactly at indices 1 and 7 (both passes of the stem mid)
  const cands = snapCandidates(coords, [20.005, 49]);
  assert.equal(cands.length, 2, `expected 2 candidates, got ${cands.length}: ${JSON.stringify(cands)}`);
  assert.deepEqual(cands, [1, 7]); // route order: outbound first, return second
});

test("snapCandidates: point near loop far side (unique location) yields exactly one candidate", () => {
  const coords = LOLLI.coordinates;
  // [20.015,49.0] is the loop far side, appears only once at index 4
  const cands = snapCandidates(coords, [20.015, 49.0]);
  assert.equal(cands.length, 1);
  assert.equal(cands[0], 4);
});

test("snapCandidates: offset ~12 m from stem yields two candidates; ~100 m yields one", () => {
  // Build lollipop with return leg offset ~12 m north from outbound
  // 1 degree lat ≈ 111 km, so 0.0001 deg ≈ 11.1 m
  const stemOut   = [[20.00, 49.000], [20.005, 49.000], [20.01, 49.000]];
  const loop2     = [[20.012, 49.002], [20.015, 49.0], [20.012, 48.998]];
  const stemBack  = [[20.01, 49.0001], [20.005, 49.0001], [20.00, 49.0001]]; // ~11 m north
  const lolliOffset = {
    type: "LineString",
    coordinates: [...stemOut, ...loop2, ...stemBack],
  };
  // Query at [20.005, 49.00005] — midpoint between out and return rows, ~5 m from each
  const cands12 = snapCandidates(lolliOffset.coordinates, [20.005, 49.00005]);
  assert.equal(cands12.length, 2, `expected 2 candidates for 12 m offset, got ${cands12.length}`);

  // Build lollipop with return leg offset ~100 m north (0.0009 deg ≈ 100 m)
  const stemBack100 = [[20.01, 49.0009], [20.005, 49.0009], [20.00, 49.0009]];
  const lolliOffset100 = {
    type: "LineString",
    coordinates: [...stemOut, ...loop2, ...stemBack100],
  };
  // Query at [20.005, 49.000] — right on the outbound leg, 100 m from return
  const cands100 = snapCandidates(lolliOffset100.coordinates, [20.005, 49.000]);
  assert.equal(cands100.length, 1, `expected 1 candidate for 100 m offset, got ${cands100.length}`);
});

test("snapAnchorIndex: 2-element anchor (legacy) returns first/global-nearest candidate (== nearestPointIndex)", () => {
  const coords = LOLLI.coordinates;
  // [20.005,49] — both nearestPointIndex and snapAnchorIndex[0] should give 1
  assert.equal(snapAnchorIndex(coords, [20.005, 49]), nearestPointIndex(coords, [20.005, 49]));
  assert.equal(snapAnchorIndex(coords, [20.005, 49]), 1); // index 1 is the first/outbound pass
  // Also test a unique point
  assert.equal(snapAnchorIndex(coords, [20.015, 49.0]), nearestPointIndex(coords, [20.015, 49.0]));
});

test("snapAnchorIndex: 3-element anchor with t near 0 picks outbound leg index", () => {
  const coords = LOLLI.coordinates;
  // t=0 → fraction near the start → outbound pass (index 1), not return pass (index 7)
  const tOut = 1 / (coords.length - 1); // fraction of index 1 in 9-vertex route = 1/8 = 0.125
  const result = snapAnchorIndex(coords, [20.005, 49, tOut]);
  assert.equal(result, 1, `expected outbound index 1, got ${result}`);
});

test("snapAnchorIndex: 3-element anchor with t near 1 picks return-leg index", () => {
  const coords = LOLLI.coordinates;
  // t near 1 → fraction near the end → return pass (index 7), not outbound (index 1)
  const tReturn = 7 / (coords.length - 1); // fraction of index 7 = 7/8 = 0.875
  const result = snapAnchorIndex(coords, [20.005, 49, tReturn]);
  assert.equal(result, 7, `expected return index 7, got ${result}`);
});

test("segmentPolylines: lollipop — two splits on same stem coords (different t) yield three distinct slices", () => {
  // This is the core user scenario: splitting both the outbound and return leg at the same spot.
  // A until [stem-mid, t-out], B until [same stem-mid coords, t-return], C → 3 slices: 0..1, 1..7, 7..8
  const coords = LOLLI.coordinates;
  const tOut    = 1 / (coords.length - 1); // t for index 1 = 1/8
  const tReturn = 7 / (coords.length - 1); // t for index 7 = 7/8
  const segs = [
    { color: "red",   style: "solid", until: [20.005, 49, tOut] },    // splits at index 1
    { color: "blue",  style: "solid", until: [20.005, 49, tReturn] }, // splits at index 7
    { color: "green", style: "solid" },                                // remainder
  ];
  const out = segmentPolylines(LOLLI, segs);
  assert.equal(out.length, 3, `expected 3 slices, got ${out.length}: ${JSON.stringify(out.map(s => ({ color: s.color, len: s.coords.length })))}`);
  // Slice 1: indices 0..1 (2 coords)
  assert.deepEqual(out[0].coords, coords.slice(0, 2), "slice 0 should be coords[0..1]");
  assert.equal(out[0].color, "red");
  // Slice 2: indices 1..7 (7 coords: 1,2,3,4,5,6,7)
  assert.deepEqual(out[1].coords, coords.slice(1, 8), "slice 1 should be coords[1..7]");
  assert.equal(out[1].color, "blue");
  // Slice 3: indices 7..8 (2 coords)
  assert.deepEqual(out[2].coords, coords.slice(7), "slice 2 should be coords[7..8]");
  assert.equal(out[2].color, "green");
});

test("closureStretch: 3-element anchor with t selects return-leg stretch instead of outbound", () => {
  const coords = LOLLI.coordinates;
  const tReturn = 7 / (coords.length - 1); // fraction for index 7
  // from = [20.005, 49, tReturn] (return leg mid), to = [20.00, 49] (end, index 8)
  const stretch = closureStretch(LOLLI, [20.005, 49, tReturn], [20.00, 49]);
  // Snap: from → index 7, to → index 0 (or 8, since both at same coords)
  // Actually [20.00,49] has t near 0 (no t given) → snapAnchorIndex picks index 0 first
  // But: a=min(7,0)=0, b=max(7,0)=7 → slice 0..7 = 8 coords
  // That's different from the legacy 2-element behavior where both snap to index 0 → null
  // With legacy: from=[20.005,49]→1, to=[20.00,49]→0, a=0,b=1, slice 0..1 = 2 coords
  // With t-aware: from=[20.005,49,tReturn]→7, to=[20.00,49]→0, a=0,b=7, slice 0..7 = 8 coords
  assert.ok(stretch !== null, "closureStretch should not return null");
  // The stretch should differ from the 2-element (legacy) behavior:
  const legacyStretch = closureStretch(LOLLI, [20.005, 49], [20.00, 49]);
  assert.notDeepEqual(stretch, legacyStretch, "t-aware stretch should differ from legacy 2-element stretch");
  // Specifically: t-aware uses return-leg index 7, so stretch spans from index 0 to 7 (8 points)
  // vs legacy: spans index 0 to 1 (2 points)
  assert.ok(stretch.length > (legacyStretch ? legacyStretch.length : 0),
    `t-aware stretch (${stretch.length} pts) should be longer than legacy (${legacyStretch ? legacyStretch.length : 0} pts)`);
});
