import { MAPY_API_KEY } from "./config.js";
import { MAPSETS, DEFAULT_MAPSET, mapsetUrl } from "./layers.js";

// Mapy require this copyright text visibly with the map (see their terms).
const ATTRIBUTION =
  '<a href="https://api.mapy.com/copyright" target="_blank" rel="noopener">&copy; Seznam.cz a.s. and others</a>';

// High Tatras (around Štrbské Pleso / Vysoké Tatry).
const TATRAS_CENTER = [49.165, 20.13];
const TATRAS_ZOOM = 12;

export function initMap(elementId = "map") {
  // No +/- zoom buttons — they crowd the floating chrome; scroll / pinch still zooms.
  const map = L.map(elementId, { zoomControl: false }).setView(TATRAS_CENTER, TATRAS_ZOOM);

  // One Leaflet tile layer per Mapy mapset, keyed by its human label for the switcher.
  const layers = {};
  for (const { id, label } of MAPSETS) {
    layers[label] = L.tileLayer(mapsetUrl(id, MAPY_API_KEY), {
      minZoom: 0,
      maxZoom: 19,
      attribution: ATTRIBUTION,
    });
  }

  const defaultLabel = MAPSETS.find((m) => m.id === DEFAULT_MAPSET).label;
  layers[defaultLabel].addTo(map);

  L.control.layers(layers, null, { position: "topright", collapsed: true }).addTo(map);

  addMapyLogo(map);
  return map;
}

// REQUIRED: the clickable Mapy.com logo, shown on the map and linking to mapy.com.
function addMapyLogo(map) {
  const LogoControl = L.Control.extend({
    options: { position: "bottomright" },
    onAdd() {
      const container = L.DomUtil.create("div", "leaflet-control leaflet-control-mapy-logo");
      const link = L.DomUtil.create("a", "", container);
      link.href = "https://mapy.com/";
      link.target = "_blank";
      link.rel = "noopener";
      const img = L.DomUtil.create("img", "", link);
      img.src = "https://api.mapy.com/img/api/logo.svg";
      img.alt = "Mapy.com";
      L.DomEvent.disableClickPropagation(link);
      return container;
    },
  });
  new LogoControl().addTo(map);
}
