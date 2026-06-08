// tests/gpx.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { gpxToLineString } from "../js/admin/gpx.js";

const TRK = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="49.10" lon="20.06"></trkpt>
  <trkpt lat="49.11" lon="20.07"></trkpt>
  <trkpt lat="49.12" lon="20.08"></trkpt>
</trkseg></trk></gpx>`;

test("parses trkpt into a GeoJSON LineString of [lon, lat] pairs", () => {
  const ls = gpxToLineString(TRK);
  assert.equal(ls.type, "LineString");
  assert.deepEqual(ls.coordinates[0], [20.06, 49.10]);
  assert.equal(ls.coordinates.length, 3);
});

test("is independent of lat/lon attribute order, and falls back to rtept", () => {
  const rte = `<gpx><rte>
    <rtept lon="20.0" lat="49.0"/>
    <rtept lat="49.5" lon="20.5"/>
  </rte></gpx>`;
  const ls = gpxToLineString(rte);
  assert.deepEqual(ls.coordinates, [[20.0, 49.0], [20.5, 49.5]]);
});

test("decimates to exactly maxPoints, keeping first and last", () => {
  let pts = "";
  for (let i = 0; i < 1000; i++) pts += `<trkpt lat="${49 + i / 1000}" lon="20"/>`;
  const ls = gpxToLineString(`<gpx><trk><trkseg>${pts}</trkseg></trk></gpx>`, { maxPoints: 100 });
  assert.equal(ls.coordinates.length, 100);
  assert.deepEqual(ls.coordinates[0], [20, 49]);
  assert.deepEqual(ls.coordinates[99], [20, 49 + 999 / 1000]);
});

test("returns the points unchanged when at or under maxPoints", () => {
  const ls = gpxToLineString(TRK, { maxPoints: 500 });
  assert.equal(ls.coordinates.length, 3);
});

test("throws when fewer than 2 points are found", () => {
  assert.throws(() => gpxToLineString("<gpx></gpx>"), /fewer than 2/);
  assert.throws(() => gpxToLineString(`<gpx><trkpt lat="49" lon="20"/></gpx>`), /fewer than 2/);
});

test("clamps maxPoints below 2 to a valid 2-point LineString (no undefined)", () => {
  const ls = gpxToLineString(TRK, { maxPoints: 1 });
  assert.equal(ls.coordinates.length, 2);
  assert.deepEqual(ls.coordinates[0], [20.06, 49.10]);
  assert.deepEqual(ls.coordinates[1], [20.08, 49.12]);
});

test("parses single-quoted lat/lon attributes", () => {
  const ls = gpxToLineString(`<gpx><trk><trkseg><trkpt lat='49.0' lon='20.0'/><trkpt lat='49.1' lon='20.1'/></trkseg></trk></gpx>`);
  assert.deepEqual(ls.coordinates, [[20.0, 49.0], [20.1, 49.1]]);
});
