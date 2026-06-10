// tests/hikes.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareHikes } from "../js/hikes.js";

const today = { mmdd: "06-05", iso: "2026-06-05" };

const rows = [
  {
    slug: "loop", name_en: "Loop", name_sk: "Okruh",
    geometry: { type: "LineString", coordinates: [[20.06, 49.11], [20.07, 49.12]] },
    seasonal_from: null, seasonal_to: null, seasonal_partial: false,
    note_en: null, note_sk: null, ref: null, closures: [],
  },
  {
    slug: "high", name_en: "High route", name_sk: "Vysoká trasa",
    geometry: { type: "LineString", coordinates: [[20.2, 49.15], [20.21, 49.18]] },
    seasonal_from: "11-01", seasonal_to: "06-15", seasonal_partial: true,
    note_en: "Upper part", note_sk: "Horná časť", ref: "https://tanap.sk/",
    closures: [],
  },
  { slug: "broken", name_en: "No geom", name_sk: "x", geometry: null, closures: [] },
  { name_en: "No slug", name_sk: "x", geometry: { type: "LineString", coordinates: [[20, 49]] }, closures: [] },
];

test("prepareHikes maps rows, computes status, and skips rows without geometry", () => {
  const out = prepareHikes(rows, today);
  assert.equal(out.length, 2);
  assert.ok(out.every((h) => h.slug), "every returned hike has a slug");
  const loop = out.find((h) => h.slug === "loop");
  const high = out.find((h) => h.slug === "high");
  assert.equal(loop.status, "open");
  assert.deepEqual(loop.name, { en: "Loop", sk: "Okruh" });
  assert.equal(loop.note, null);
  assert.equal(high.status, "partial");
  assert.deepEqual(high.note, { en: "Upper part", sk: "Horná časť" });
  assert.equal(high.ref, "https://tanap.sk/");
  assert.ok(high.geometry.type === "LineString");
});

test("prepareHikes tolerates null/empty input", () => {
  assert.deepEqual(prepareHikes(null, today), []);
  assert.deepEqual(prepareHikes([], today), []);
});

test("prepareHikes: maps hike_regions to region_ids", () => {
  const rows = [{ slug: "a", geometry: { type: "LineString", coordinates: [[0,0],[1,1]] }, hike_regions: [{ region_id: 1 }, { region_id: 5 }] }];
  const [h] = prepareHikes(rows, { iso: "2026-06-10", mmdd: "06-10" });
  assert.deepEqual(h.region_ids, [1, 5]);
});

test("prepareHikes: maps stat fields and falls back to geometry distance", () => {
  const geom = { type: "LineString", coordinates: [[20, 49], [20, 50]] }; // ~111 km
  const [a, b] = prepareHikes([
    { slug: "a", name_en: "A", name_sk: "A", geometry: geom, ascent_m: 540, duration_min: 210 },
    { slug: "b", name_en: "B", name_sk: "B", geometry: geom, distance_m: 5000 },
  ], today);
  assert.ok(Math.abs(a.distance_m - 111195) < 1000, `fallback ${a.distance_m}`);
  assert.equal(a.ascent_m, 540);
  assert.equal(a.duration_min, 210);
  assert.equal(b.distance_m, 5000); // an explicit value wins over the fallback
  assert.equal(b.ascent_m, null);
});

test("prepareHikes: maps is_public (absent → true, explicit false → false)", () => {
  const geom = { type: "LineString", coordinates: [[0, 0], [1, 1]] };
  const [a, b] = prepareHikes([
    { slug: "a", name_en: "A", name_sk: "A", geometry: geom },                   // no is_public
    { slug: "b", name_en: "B", name_sk: "B", geometry: geom, is_public: false }, // explicit false
  ], { iso: "2026-06-10", mmdd: "06-10" });
  assert.equal(a.is_public, true);
  assert.equal(b.is_public, false);
});
