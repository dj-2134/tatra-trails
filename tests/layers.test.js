import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAPSET, MAPSETS, mapsetUrl } from "../js/layers.js";

test("default mapset is outdoor", () => {
  assert.equal(DEFAULT_MAPSET, "outdoor");
});

test("offers the four expected mapsets in order", () => {
  assert.deepEqual(
    MAPSETS.map((m) => m.id),
    ["outdoor", "basic", "aerial", "winter"]
  );
});

test("every mapset has a human label", () => {
  for (const m of MAPSETS) assert.ok(m.label, `${m.id} missing label`);
});

test("mapsetUrl builds a Mapy XYZ template with key and default tile size", () => {
  assert.equal(
    mapsetUrl("outdoor", "KEY123"),
    "https://api.mapy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}?apikey=KEY123"
  );
});

test("mapsetUrl honors a custom tile size", () => {
  assert.match(mapsetUrl("winter", "K", 512), /\/winter\/512\/\{z\}\/\{x\}\/\{y\}\?apikey=K$/);
});
