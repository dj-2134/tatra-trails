import { initUi } from "./ui.js";
import { initMap } from "./map.js";
import { initTrails } from "./trails.js";

initUi();
const map = initMap("map");
initTrails(map);
