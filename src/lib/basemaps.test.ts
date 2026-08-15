import { describe, it, expect } from "vitest";
import {
  BASEMAPS,
  DEFAULT_BASEMAP_ID,
  basemapUrl,
  parseBasemapParam,
} from "./basemaps";
import { OPENFREEMAP_STYLE } from "./map-style";

describe("basemap catalogue", () => {
  it("defaults to the style the map has always used", () => {
    // Changing the default silently would change every existing screenshot
    // and every shared link that omits the parameter.
    expect(basemapUrl(DEFAULT_BASEMAP_ID)).toBe(OPENFREEMAP_STYLE);
  });

  it("serves every style from the one provider already attributed", () => {
    // The footer credits OpenFreeMap and OpenStreetMap. A style from
    // anywhere else would need its own attribution and its own licence
    // check, so the catalogue is deliberately closed to one host.
    for (const map of BASEMAPS) {
      expect(map.url.startsWith("https://tiles.openfreemap.org/styles/")).toBe(
        true,
      );
    }
  });

  it("has unique ids and a label key for each", () => {
    const ids = BASEMAPS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const map of BASEMAPS) {
      expect(map.labelKey).toBe(`basemap.${map.id}`);
    }
  });

  it("falls back to the default for an unknown id", () => {
    expect(basemapUrl("nope")).toBe(basemapUrl(DEFAULT_BASEMAP_ID));
  });
});

describe("parseBasemapParam", () => {
  it("accepts an id in the catalogue", () => {
    expect(parseBasemapParam("dark")).toBe("dark");
  });

  it("returns null for the default, so the URL stays clean", () => {
    expect(parseBasemapParam(DEFAULT_BASEMAP_ID)).toBeNull();
  });

  it("drops anything not in the catalogue", () => {
    // A shared link is untrusted input, and an arbitrary style URL from a
    // query string would be a way to point the map at any host at all.
    for (const raw of [null, "", "nope", "https://evil.example/style.json"]) {
      expect(parseBasemapParam(raw)).toBeNull();
    }
  });
});
