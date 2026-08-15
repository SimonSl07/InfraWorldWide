import type { Category } from "./schema";

/**
 * Colours the map canvas needs, per theme.
 *
 * The rest of the app themes itself through the CSS custom properties in
 * globals.css. MapLibre cannot: paint properties are values handed to a WebGL
 * renderer, so they never see a custom property and never re-evaluate on a
 * media query. Anything drawn on the canvas has to be resolved in JS here.
 *
 * Anything drawn in the DOM (a legend swatch, a category dot) should use
 * `categoryVar` instead, so it follows the theme without any JS at all.
 */

/** CSS variable per category, for DOM elements. */
export const CATEGORY_VARS: Record<Category, string> = {
  highway: "var(--cat-highway)",
  railway: "var(--cat-railway)",
  bridge: "var(--cat-bridge)",
  tunnel: "var(--cat-tunnel)",
};

export function categoryVar(category: Category): string {
  return CATEGORY_VARS[category];
}

export interface MapTheme {
  /** Drawn under every line to separate it from the basemap. */
  casing: string;
  /** Stroke around the bridge and tunnel midpoint markers. */
  markerStroke: string;
  category: Record<Category, string>;
}

export const LIGHT_MAP: MapTheme = {
  casing: "#ffffff",
  markerStroke: "#ffffff",
  category: {
    highway: "#2563eb", // blue-600
    railway: "#16a34a", // green-600
    bridge: "#d97706", // amber-600
    tunnel: "#7c3aed", // violet-600
  },
};

/**
 * Mirrors the dark token block in globals.css. The category hues move up a
 * step because blue-600 and violet-600 reach only 3.1:1 and 2.8:1 against the
 * dark ground, and the casing reverses: a white casing on a dark basemap is
 * brighter than the line it is supposed to frame.
 */
export const DARK_MAP: MapTheme = {
  casing: "#0c0c0e",
  markerStroke: "#0c0c0e",
  category: {
    highway: "#60a5fa", // blue-400
    railway: "#4ade80", // green-400
    bridge: "#fbbf24", // amber-400
    tunnel: "#a78bfa", // violet-400
  },
};

export function mapColorsFor(dark: boolean): MapTheme {
  return dark ? DARK_MAP : LIGHT_MAP;
}
