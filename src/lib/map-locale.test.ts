import { describe, it, expect } from "vitest";
import { MAPLIBRE_STRING_KEYS, mapLocale } from "./map-locale";

/** A translator that echoes the key, so the mapping itself is what is tested. */
const echo = (key: string) => `t(${key})`;

describe("mapLocale", () => {
  it("maps every MapLibre string id to its translation", () => {
    const locale = mapLocale(echo);
    expect(locale["NavigationControl.ZoomIn"]).toBe("t(maplibre.zoomIn)");
    expect(locale["AttributionControl.ToggleAttribution"]).toBe(
      "t(maplibre.toggleAttribution)",
    );
    expect(locale["Popup.Close"]).toBe("t(maplibre.closePopup)");
  });

  it("covers exactly the ids in the table and no others", () => {
    const locale = mapLocale(echo);
    expect(Object.keys(locale).sort()).toEqual(
      Object.keys(MAPLIBRE_STRING_KEYS).sort(),
    );
  });

  it("only names string ids MapLibre actually recognises", () => {
    // A typo here is silent: MapLibre merges the patch over its defaults and
    // ignores an id it does not know, so the control stays English.
    const known = new Set([
      "AttributionControl.ToggleAttribution",
      "AttributionControl.MapFeedback",
      "FullscreenControl.Enter",
      "FullscreenControl.Exit",
      "GeolocateControl.FindMyLocation",
      "GeolocateControl.LocationNotAvailable",
      "LogoControl.Title",
      "Map.Title",
      "Marker.Title",
      "NavigationControl.ResetBearing",
      "NavigationControl.ZoomIn",
      "NavigationControl.ZoomOut",
      "Popup.Close",
      "ScaleControl.Feet",
      "ScaleControl.Meters",
      "ScaleControl.Kilometers",
      "ScaleControl.Miles",
      "ScaleControl.NauticalMiles",
    ]);
    const unknown = Object.keys(MAPLIBRE_STRING_KEYS).filter(
      (id) => !known.has(id),
    );
    expect(unknown).toEqual([]);
  });

  it("puts every message key under the maplibre namespace", () => {
    const stray = Object.values(MAPLIBRE_STRING_KEYS).filter(
      (key) => !key.startsWith("maplibre."),
    );
    expect(stray).toEqual([]);
  });

  it("returns a fresh object each call", () => {
    expect(mapLocale(echo)).not.toBe(mapLocale(echo));
  });
});
