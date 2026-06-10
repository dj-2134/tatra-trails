// tests/regions.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRegionsEastWest, publicVisibleHikes, groupHikesByRegion } from "../js/regions.js";

const R = {
  vt: { id: 1, slug: "vysoke-tatry", name_en: "High Tatras", name_sk: "Vysoké Tatry", centroid_lon: 20.13, is_public: true },
  mf: { id: 2, slug: "mala-fatra", name_en: "Malá Fatra", name_sk: "Malá Fatra", centroid_lon: 19.05, is_public: true },
  vv: { id: 3, slug: "volovske-vrchy", name_en: "Volovské vrchy", name_sk: "Volovské vrchy", centroid_lon: 20.75, is_public: false },
  no: { id: 4, slug: "no-centroid", name_en: "No Centroid", name_sk: "Bez", centroid_lon: null, is_public: true },
};
// distances: short <5000, moderate 5000–9999
const h = (slug, distance_m, region_ids) => ({ slug, distance_m, region_ids });

test("sortRegionsEastWest: east (higher lon) first, null centroid last", () => {
  const order = sortRegionsEastWest([R.mf, R.no, R.vt, R.vv]).map((r) => r.slug);
  assert.deepEqual(order, ["volovske-vrchy", "vysoke-tatry", "mala-fatra", "no-centroid"]);
});

test("publicVisibleHikes: only hikes in >=1 public region", () => {
  const hikes = [
    h("a", 1000, [1]),       // in VT (public)
    h("b", 1000, [3]),       // only in VV (private) -> excluded
    h("c", 1000, [3, 2]),    // in MF (public) -> included
    h("d", 1000, []),        // no region -> excluded
  ];
  const got = publicVisibleHikes(hikes, [R.vt, R.mf, R.vv]).map((x) => x.slug).sort();
  assert.deepEqual(got, ["a", "c"]);
});

test("groupHikesByRegion: public+non-empty regions east→west; hike under each public region; bands ordered", () => {
  const hikes = [
    h("trav", 1000, [1, 2]), // spans VT + MF -> appears under both
    h("vtmod", 6000, [1]),   // VT moderate
    h("priv", 1000, [3]),    // only private -> nowhere
  ];
  const model = groupHikesByRegion(hikes, [R.vt, R.mf, R.vv]);
  // east→west: VT (20.13) before MF (19.05); VV private omitted
  assert.deepEqual(model.map((g) => g.region.slug), ["vysoke-tatry", "mala-fatra"]);
  // VT has short(trav) then moderate(vtmod)
  const vt = model[0];
  assert.deepEqual(vt.bands.map((b) => b.band.key), ["short", "moderate"]);
  assert.deepEqual(vt.bands[0].hikes.map((x) => x.slug), ["trav"]);
  assert.deepEqual(vt.bands[1].hikes.map((x) => x.slug), ["vtmod"]);
  // MF has only "trav"
  assert.deepEqual(model[1].bands.flatMap((b) => b.hikes.map((x) => x.slug)), ["trav"]);
});

test("groupHikesByRegion: an all-private/empty world yields []", () => {
  assert.deepEqual(groupHikesByRegion([h("x", 1000, [3])], [R.vv]), []);
});
