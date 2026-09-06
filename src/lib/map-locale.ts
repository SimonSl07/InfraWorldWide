/**
 * Translations for MapLibre's own UI.
 *
 * MapLibre renders the canvas accessible name, the attribution toggle, the
 * zoom buttons and the popup close button from an internal English table.
 * None of that reaches next-intl, so /ro used to be a Romanian page around
 * an English map. `locale` on the Map patches that table.
 *
 * Ids MapLibre does not recognise are dropped silently, which is why the
 * list is pinned by a test rather than trusted to a typo.
 */

/** MapLibre string id to the message key that carries its translation. */
export const MAPLIBRE_STRING_KEYS: Record<string, string> = {
  "Map.Title": "maplibre.canvas",
  "Marker.Title": "maplibre.marker",
  "AttributionControl.ToggleAttribution": "maplibre.toggleAttribution",
  "NavigationControl.ZoomIn": "maplibre.zoomIn",
  "NavigationControl.ZoomOut": "maplibre.zoomOut",
  "NavigationControl.ResetBearing": "maplibre.resetBearing",
  "FullscreenControl.Enter": "maplibre.enterFullscreen",
  "FullscreenControl.Exit": "maplibre.exitFullscreen",
  "GeolocateControl.FindMyLocation": "maplibre.findMyLocation",
  "GeolocateControl.LocationNotAvailable": "maplibre.locationNotAvailable",
  "Popup.Close": "maplibre.closePopup",
};

/**
 * The `locale` patch to hand a `<Map>`, built from a translator.
 *
 * Scale-bar units are left alone deliberately: "m" and "km" are the same in
 * both locales, and the imperial ids never render because the scale bar is
 * mounted in metric.
 */
export function mapLocale(t: (key: string) => string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(MAPLIBRE_STRING_KEYS).map(([id, key]) => [id, t(key)]),
  );
}
