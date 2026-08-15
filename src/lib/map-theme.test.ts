import { describe, it, expect } from "vitest";
import {
  CATEGORY_VARS,
  DARK_MAP,
  LIGHT_MAP,
  categoryVar,
  mapColorsFor,
} from "./map-theme";
import { ALL_CATEGORIES } from "./map-style";

/**
 * MapLibre paint properties are plain values handed to a WebGL renderer, so
 * unlike the DOM they cannot read a CSS custom property and cannot react to a
 * media query. Anything drawn on the canvas has to be resolved in JS, which
 * is what this module is for. Anything drawn in the DOM should use the CSS
 * variable instead, which is what `categoryVar` is for.
 */

describe("categoryVar", () => {
  it("returns a CSS variable reference, so the DOM follows the theme itself", () => {
    expect(categoryVar("highway")).toBe("var(--cat-highway)");
  });

  it("covers every category", () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_VARS[category]).toMatch(/^var\(--cat-[a-z]+\)$/);
    }
  });
});

describe("mapColorsFor", () => {
  it("reverses the line casing, which is what makes a line read on the ground", () => {
    // A white casing separates a line from a pale basemap. On a dark
    // basemap the same white casing is brighter than the line it frames.
    expect(mapColorsFor(false).casing).toBe("#ffffff");
    expect(mapColorsFor(true).casing).not.toBe("#ffffff");
  });

  it("lifts the category hues in dark mode", () => {
    // blue-600 and violet-600 sit at 3.1:1 and 2.8:1 on the dark ground.
    for (const category of ALL_CATEGORIES) {
      expect(mapColorsFor(true).category[category]).not.toBe(
        mapColorsFor(false).category[category],
      );
    }
  });

  it("gives every category a colour in both themes", () => {
    for (const theme of [LIGHT_MAP, DARK_MAP]) {
      for (const category of ALL_CATEGORIES) {
        expect(theme.category[category]).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("keeps the two themes structurally identical", () => {
    // A key present in one and missing in the other is a layer that renders
    // undefined in exactly one theme, which is the failure worth guarding.
    expect(Object.keys(DARK_MAP).sort()).toEqual(Object.keys(LIGHT_MAP).sort());
  });
});
