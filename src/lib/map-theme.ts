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
  /** Tint over the selected or hovered country on the main map. */
  countryFill: string;
  /** Border of the selected country. */
  countryOutline: string;
  /** Border of every other country, fading out with zoom. */
  countryOutlineMuted: string;
  /** Fill of a picked country on the comparison picker. */
  pickerPicked: string;
  /** Fill of the countries still available to pick. */
  pickerUnpicked: string;
  /** Border of every country on the picker. */
  pickerOutline: string;
  /** Glow under the selected lot, on the main map and the city map. */
  selectedHighlight: string;
  /** Glow under track that opened inside the comparison window. */
  newlyOpened: string;
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
  countryFill: "#0f172a", // slate-900
  countryOutline: "#0f172a",
  countryOutlineMuted: "#94a3b8", // slate-400
  pickerPicked: "#0f172a",
  pickerUnpicked: "#64748b", // slate-500
  pickerOutline: "#0f172a",
  selectedHighlight: "#facc15", // yellow-400
  newlyOpened: "#ec4899", // pink-500, used nowhere else on the map
};

/**
 * Mirrors the dark token block in globals.css. The category hues move up a
 * step because blue-600 and violet-600 reach only 3.1:1 and 2.8:1 against the
 * dark ground, and the casing reverses: a white casing on a dark basemap is
 * brighter than the line it is supposed to frame.
 *
 * The country and picker inks reverse for the same reason: slate-900 at 8%
 * over a near-black basemap is no tint at all, so the selected country was
 * invisible. The two glows move up a step instead, as the categories do:
 * they sit under lines that got brighter, and a glow darker than the line it
 * frames reads as a shadow.
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
  countryFill: "#e4e4e7", // zinc-200
  countryOutline: "#e4e4e7",
  countryOutlineMuted: "#71717a", // zinc-500
  pickerPicked: "#e4e4e7",
  pickerUnpicked: "#a1a1aa", // zinc-400
  pickerOutline: "#e4e4e7",
  selectedHighlight: "#fde047", // yellow-300
  newlyOpened: "#f472b6", // pink-400
};

export function mapColorsFor(dark: boolean): MapTheme {
  return dark ? DARK_MAP : LIGHT_MAP;
}
