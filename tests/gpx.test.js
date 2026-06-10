// tests/gpx.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { gpxToLineString, gpxStats, gpxName } from "../js/admin/gpx.js";

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

test("gpxStats: distance + ascent from a track that has <ele> children", () => {
  const gpx = `<gpx><trk><trkseg>
    <trkpt lat="49.0" lon="20.0"><ele>1000</ele></trkpt>
    <trkpt lat="49.0" lon="20.01"><ele>1100</ele></trkpt>
    <trkpt lat="49.0" lon="20.02"><ele>1050</ele></trkpt>
  </trkseg></trk></gpx>`;
  const { distanceM, ascentM } = gpxStats(gpx);
  assert.ok(distanceM > 1000 && distanceM < 2000, `distance ${distanceM}`);
  assert.equal(ascentM, 100); // +100 then -50 → ascent 100
});

test("gpxStats: ascent is null when the track has no elevation", () => {
  const gpx = `<gpx><trk><trkseg><trkpt lat="49.0" lon="20.0"/><trkpt lat="49.0" lon="20.01"/></trkseg></trk></gpx>`;
  const { distanceM, ascentM } = gpxStats(gpx);
  assert.ok(distanceM > 0);
  assert.equal(ascentM, null);
});

test("gpxName: extracts the <trk><name>", () => {
  const gpx = `<gpx><trk><name>Štrbské Pleso → Popradské Pleso</name><trkseg></trkseg></trk></gpx>`;
  assert.equal(gpxName(gpx), "Štrbské Pleso → Popradské Pleso");
});

test("gpxName: prefers <trk><name> over <metadata><name>", () => {
  const gpx = `<gpx><metadata><name>Meta name</name></metadata><trk><name>Track name</name></trk></gpx>`;
  assert.equal(gpxName(gpx), "Track name");
});

test("gpxName: falls back to <rte><name> when there is no track", () => {
  const gpx = `<gpx><rte><name>Route name</name></rte></gpx>`;
  assert.equal(gpxName(gpx), "Route name");
});

test("gpxName: trims whitespace and decodes basic XML entities", () => {
  const gpx = `<gpx><trk><name>  A &amp; B &lt;x&gt;  </name></trk></gpx>`;
  assert.equal(gpxName(gpx), "A & B <x>");
});

test("gpxName: null when there is no name or it is empty", () => {
  assert.equal(gpxName(`<gpx><trk><trkseg></trkseg></trk></gpx>`), null);
  assert.equal(gpxName(`<gpx><trk><name>   </name></trk></gpx>`), null);
  assert.equal(gpxName(""), null);
  assert.equal(gpxName(null), null);
});
