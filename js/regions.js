// js/regions.js — PURE region helpers: east→west ordering, public-visibility filter, and
// Region→band grouping for the public list. No DOM deps; unit-testable.
import { BANDS, bandForDistance } from "./bands.js";

const skName = (r) => String((r && r.name_sk) || "");

// Regions east→west: centroid_lon DESC (higher lon = more east), name_sk tiebreak, null lon last.
export function sortRegionsEastWest(regions) {
  return [...(regions || [])].sort((a, b) => {
    const ax = a && a.centroid_lon, bx = b && b.centroid_lon;
    const an = !Number.isFinite(ax), bn = !Number.isFinite(bx);
    if (an && bn) return skName(a).localeCompare(skName(b));
    if (an) return 1;
    if (bn) return -1;
    if (bx !== ax) return bx - ax;
    return skName(a).localeCompare(skName(b));
  });
}

function publicRegionIdSet(regions) {
  return new Set((regions || []).filter((r) => r && r.is_public).map((r) => r.id));
}

// Hikes belonging to >=1 public region AND not individually hidden. region_ids: number[];
// is_public defaults to public when absent. showAll=true returns ALL hikes (authenticated full view).
export function publicVisibleHikes(hikes, regions, showAll = false) {
  if (showAll) return [...(hikes || [])];
  const pub = publicRegionIdSet(regions);
  return (hikes || []).filter(
    (h) => h.is_public !== false && (h.region_ids || []).some((id) => pub.has(id))
  );
}

// Render model: [{ region, bands:[{ band, hikes }] }]. showAll=false → public, non-empty regions only
// (today's behavior). showAll=true → EVERY non-empty region (private included) + all hikes.
export function groupHikesByRegion(hikes, regions, showAll = false) {
  const visible = publicVisibleHikes(hikes, regions, showAll);
  const out = [];
  for (const region of sortRegionsEastWest(regions)) {
    if (!showAll && !region.is_public) continue;
    const inRegion = visible.filter((h) => (h.region_ids || []).includes(region.id));
    if (!inRegion.length) continue;
    const bands = [];
    for (const band of BANDS) {
      const inBand = inRegion.filter((h) => bandForDistance(h.distance_m) === band.key);
      if (inBand.length) bands.push({ band, hikes: inBand });
    }
    out.push({ region, bands });
  }
  return out;
}
