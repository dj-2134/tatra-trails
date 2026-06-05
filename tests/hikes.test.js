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
];

test("prepareHikes maps rows, computes status, and skips rows without geometry", () => {
  const out = prepareHikes(rows, today);
  assert.equal(out.length, 2);
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
