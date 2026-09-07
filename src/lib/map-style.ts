import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import type { Category, Status } from "./schema";
import { LIGHT_MAP, type MapTheme } from "./map-theme";

/**
 * The light palette's category hues: the default wherever nothing passes a
 * theme, and the only palette the Open Graph image, rendered once for every
 * reader, can be drawn with.
 */
export const CATEGORY_COLORS = LIGHT_MAP.category;

export const ALL_CATEGORIES = Object.keys(CATEGORY_COLORS) as Category[];

/** Statuses rendered on the map (cancelled lots are hidden). */
export const MAP_STATUSES: Status[] = [
  "opened",
  "under_construction",
  "tendered",
  "planned",
];

export const OPENFREEMAP_STYLE =
  "https://tiles.openfreemap.org/styles/positron";

/* ── Country selection paint ──────────────────────────────────────────── */

/** Opacity multiplier applied to lots outside the selected country. */
export const DIMMED = 0.18;

/** Matches the country a feature belongs to. Never matches when none is set. */
function isCountry(code: string | null): ExpressionSpecification {
  // "" is a safe sentinel: no feature carries an empty country code.
  return ["==", ["get", "country"], code ?? ""] as ExpressionSpecification;
}

/**
 * A layer's opacity, faded for lots outside the selected country. Each layer
 * passes its own full-strength value, so selecting a country scales the
 * existing hierarchy rather than flattening every layer to one opacity.
 */
export function dimByCountry(
  full: number,
  selected: string | null,
): number | ExpressionSpecification {
  if (selected === null) return full;
  return [
    "case",
    isCountry(selected),
    full,
    full * DIMMED,
  ] as unknown as ExpressionSpecification;
}

/**
 * Country fill opacity. The default is barely visible rather than zero
 * because the fill exists to be clicked, and MapLibre does not hit-test a
 * fully transparent fill.
 */
export function countryFillOpacity(
  selected: string | null,
  hovered: string | null,
): ExpressionSpecification {
  return [
    "case",
    isCountry(selected),
    0.08,
    isCountry(hovered),
    0.05,
    0.01,
  ] as unknown as ExpressionSpecification;
}

/**
 * Country outline opacity, fading out as you zoom in.
 *
 * These are 1:50m borders, so they drift from the basemap's own boundaries
 * at high zoom and must be gone before that shows. The zoom interpolation
 * has to be the OUTERMOST expression with the per-feature "case" inside its
 * stops: MapLibre allows only one zoom-dependent interpolate per expression
 * and rejects the whole layer if one is nested inside a "case".
 */
export function countryOutlineOpacity(
  selected: string | null,
): ExpressionSpecification {
  const byState = (on: number, off: number) =>
    ["case", isCountry(selected), on, off] as ExpressionSpecification;
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    4,
    byState(0.9, 0.35),
    8,
    byState(0.5, 0),
    10,
    byState(0.2, 0),
  ] as unknown as ExpressionSpecification;
}

export function countryOutlineColor(
  selected: string | null,
  theme: MapTheme = LIGHT_MAP,
): ExpressionSpecification {
  return [
    "case",
    isCountry(selected),
    theme.countryOutline,
    theme.countryOutlineMuted,
  ] as unknown as ExpressionSpecification;
}

export function countryOutlineWidth(
  selected: string | null,
): ExpressionSpecification {
  return [
    "case",
    isCountry(selected),
    2,
    1,
  ] as unknown as ExpressionSpecification;
}

/* ── City view paint ──────────────────────────────────────────────────── */

/** Matches one project. Never matches when none is selected. */
function isProject(id: string | null): ExpressionSpecification {
  // "" is a safe sentinel: no feature carries an empty project id.
  return ["==", ["get", "projectId"], id ?? ""] as ExpressionSpecification;
}

/**
 * A layer's opacity on the city map, faded for every line except the
 * selected one. Same idea as dimByCountry, keyed on the project instead, so
 * picking a metro line pushes the other lines back without hiding them.
 */
export function dimByProject(
  full: number,
  selected: string | null,
): number | ExpressionSpecification {
  if (selected === null) return full;
  return [
    "case",
    isProject(selected),
    full,
    full * DIMMED,
  ] as unknown as ExpressionSpecification;
}

/** Filter selecting one project's features, for the highlight layer. */
export function projectFilter(id: string): ExpressionSpecification {
  return isProject(id);
}

/* ── Country picker paint (the comparison map) ────────────────────────── */

/** Matches any of several countries. Never matches on an empty list. */
function inCountries(codes: string[]): ExpressionSpecification {
  return [
    "in",
    ["get", "country"],
    ["literal", codes],
  ] as unknown as ExpressionSpecification;
}

/**
 * Fill for the picker map: picked countries are solid, the one under the
 * cursor is tinted, the rest stay faintly visible so they read as
 * clickable. As with the main map the floor is above zero, because
 * MapLibre does not hit-test a fully transparent fill.
 */
export function pickedFillOpacity(
  picked: string[],
  hovered: string | null,
): ExpressionSpecification {
  return [
    "case",
    inCountries(picked),
    0.55,
    isCountry(hovered),
    0.25,
    0.08,
  ] as unknown as ExpressionSpecification;
}

export function pickedFillColor(
  picked: string[],
  theme: MapTheme = LIGHT_MAP,
): ExpressionSpecification {
  return [
    "case",
    inCountries(picked),
    theme.pickerPicked,
    theme.pickerUnpicked,
  ] as unknown as ExpressionSpecification;
}

export function pickedOutlineWidth(picked: string[]): ExpressionSpecification {
  return [
    "case",
    inCountries(picked),
    2,
    0.75,
  ] as unknown as ExpressionSpecification;
}

/* ── Category paint ───────────────────────────────────────────────────── */

/**
 * Colour a feature by its category.
 *
 * Four components used to rebuild this same "match" inline, which is exactly
 * what AGENTS.md says not to do: an expression built in a component is never
 * seen by the spec validation in map-style.test.ts, and a malformed one
 * silently drops the whole layer with no error.
 */
export function categoryColorExpr(
  fallback = "#666666",
  /**
   * Resolved hex per category. Defaults to the light palette. MapLibre paint
   * values never see a CSS custom property, so a themed map has to pass the
   * dark palette in explicitly; see `mapColorsFor` in map-theme.ts.
   */
  colors: Record<Category, string> = CATEGORY_COLORS,
): ExpressionSpecification {
  return [
    "match",
    ["get", "category"],
    ...ALL_CATEGORIES.flatMap((category) => [category, colors[category]]),
    fallback,
  ] as unknown as ExpressionSpecification;
}

/**
 * Dash pattern per status, so status is legible without colour.
 *
 * Solid for what exists, progressively broken for what does not. This is the
 * only non-colour status cue on the map, which matters because the palette
 * puts railway green next to bridge amber, a deuteranopia confusion pair.
 */
export const STATUS_DASHES: Record<string, number[] | undefined> = {
  opened: undefined,
  under_construction: [2, 1.5],
  tendered: [1, 1.5],
  planned: [0.5, 2],
};

/* ── Lot vocabulary shared by the mini-maps ───────────────────────────── */

/** Lots already carrying traffic. */
export const OPENED_FILTER = [
  "==",
  ["get", "status"],
  "opened",
] as unknown as FilterSpecification;

/** Everything else, including a status the map has no dash for. */
export const UNOPENED_FILTER = [
  "!=",
  ["get", "status"],
  "opened",
] as unknown as FilterSpecification;

/** Bridges and tunnels get a midpoint marker in the data build. */
export const MARKER_FILTER = [
  "==",
  ["get", "marker"],
  true,
] as unknown as FilterSpecification;

/**
 * Dash pattern per status, for the layer drawing everything not yet open.
 *
 * `line-dasharray` is data-driven in MapLibre 5, so one layer carries all
 * three unopened statuses instead of needing one layer each. Opened lots are
 * drawn by a separate solid layer, which is why "opened" is absent here: its
 * entry in STATUS_DASHES is undefined and an expression cannot return that.
 *
 * There is no zoom term, so this composes with the zoom interpolation on
 * line-width without breaking the one-interpolate-outermost rule.
 */
export function statusDashExpr(): ExpressionSpecification {
  const stops = MAP_STATUSES.flatMap((status) => {
    const dash = STATUS_DASHES[status];
    return dash ? [status, ["literal", dash]] : [];
  });
  return [
    "match",
    ["get", "status"],
    ...stops,
    ["literal", [2, 2]],
  ] as unknown as ExpressionSpecification;
}
