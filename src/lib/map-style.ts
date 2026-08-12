import type { ExpressionSpecification } from "maplibre-gl";
import type { Category, Status } from "./schema";

export const CATEGORY_COLORS: Record<Category, string> = {
  highway: "#2563eb", // blue-600
  railway: "#16a34a", // green-600
  bridge: "#d97706", // amber-600
  tunnel: "#7c3aed", // violet-600
};

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
): ExpressionSpecification {
  return [
    "case",
    isCountry(selected),
    "#0f172a",
    "#94a3b8",
  ] as unknown as ExpressionSpecification;
}

export function countryOutlineWidth(
  selected: string | null,
): ExpressionSpecification {
  return ["case", isCountry(selected), 2, 1] as unknown as ExpressionSpecification;
}
