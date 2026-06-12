// tests/route-endpoints.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { routeEndpoints } from "../js/route-endpoints.js";

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
});
