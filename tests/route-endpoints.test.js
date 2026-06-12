// tests/route-endpoints.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { routeEndpoints, parkingSearchUrl, trailheadPinUrl } from "../js/route-endpoints.js";
import { haversineMeters } from "../js/stats.js";

const line = (coords) => ({ type: "LineString", coordinates: coords });

test("routeEndpoints: start = first point, end = last point, not a loop", () => {
  const r = routeEndpoints(line([[20.06, 49.12], [20.07, 49.13], [20.09, 49.15]]));
  assert.deepEqual(r.start, [20.06, 49.12]);
  assert.deepEqual(r.end, [20.09, 49.15]);
  assert.equal(r.isLoop, false);
});

test("routeEndpoints: loop when endpoints are within 100 m", () => {
  // 0.0005° of latitude ≈ 56 m
  const r = routeEndpoints(line([[20.06, 49.12], [20.10, 49.15], [20.06, 49.1205]]));
  assert.equal(r.isLoop, true);
});

test("routeEndpoints: not a loop just over the threshold", () => {
  // 0.0012° of latitude ≈ 133 m
  const r = routeEndpoints(line([[20.06, 49.12], [20.10, 49.15], [20.06, 49.1212]]));
  assert.equal(r.isLoop, false);
});

test("routeEndpoints: loopThresholdM is configurable", () => {
  const g = line([[20.06, 49.12], [20.10, 49.15], [20.06, 49.1212]]); // ≈133 m apart
  assert.equal(routeEndpoints(g, { loopThresholdM: 150 }).isLoop, true);
});

test("routeEndpoints: null on missing/invalid/short geometry", () => {
  assert.equal(routeEndpoints(null), null);
  assert.equal(routeEndpoints(undefined), null);
  assert.equal(routeEndpoints({}), null);
  assert.equal(routeEndpoints({ type: "MultiLineString", coordinates: [[[20, 49], [21, 49]]] }), null);
  assert.equal(routeEndpoints(line([])), null);
  assert.equal(routeEndpoints(line([[20, 49]])), null);
  assert.equal(routeEndpoints({ type: "LineString", coordinates: [42, 99] }), null);
});

test("routeEndpoints: distance exactly at the threshold counts as a loop (<=)", () => {
  const a = [20.06, 49.12], b = [20.06, 49.1205];
  const exact = haversineMeters(a, b); // ≈56 m — same float the implementation compares against
  const g = line([a, [20.10, 49.15], b]);
  assert.equal(routeEndpoints(g, { loopThresholdM: exact }).isLoop, true);
  assert.equal(routeEndpoints(g, { loopThresholdM: exact - 0.001 }).isLoop, false);
});

test("parkingSearchUrl: lat comes before lon in the URL (GeoJSON order is swapped)", () => {
  assert.equal(
    parkingSearchUrl([20.0604, 49.1196]),
    "https://www.google.com/maps/search/parking/@49.1196,20.0604,15z",
  );
});

test("parkingSearchUrl: integer coordinates pass through unchanged", () => {
  assert.equal(parkingSearchUrl([20, 49]), "https://www.google.com/maps/search/parking/@49,20,15z");
});

test("trailheadPinUrl: drops a pin at lat,lon (GeoJSON order is swapped)", () => {
  assert.equal(
    trailheadPinUrl([20.0604, 49.1196]),
    "https://www.google.com/maps/search/?api=1&query=49.1196%2C20.0604",
  );
});
