import type { FilterSpecification } from "maplibre-gl";
import type { Category } from "./schema";
import { ALL_CATEGORIES } from "./map-style";

/**
 * Pure map-state logic, kept separate from React components so it can be
 * unit-tested. All functions return MapLibre style expressions.
 */

export interface YearFilters {
  /** Lots opened at or before the year. */
  opened: FilterSpecification;
  /** Lots whose construction started but hadn't opened yet at the year. */
  underConstruction: FilterSpecification;
  /** Lots not yet started at the year (only rendered at "present"). */
  future: FilterSpecification;
}

export function buildYearFilters(
  year: number,
  categories: ReadonlySet<Category>,
  nowYear: number,
): YearFilters {
  const inCategory = [
    "in",
    ["get", "category"],
    ["literal", [...categories]],
  ] as unknown as FilterSpecification;

  // "Effectively opened" at the selected year: actually opened — or, when
  // viewing the future, past its expected opening date.
  const openedByYear = [
    "all",
    ["!=", ["get", "opened"], null],
    ["<=", ["get", "opened"], year],
  ] as unknown as FilterSpecification;
  const effectivelyOpened =
    year > nowYear
      ? ([
          "any",
          openedByYear,
          [
            "all",
            ["!=", ["get", "expectedOpening"], null],
            ["<=", ["get", "expectedOpening"], year],
          ],
        ] as unknown as FilterSpecification)
      : openedByYear;

  const opened = [
    "all",
    inCategory,
    effectivelyOpened,
  ] as unknown as FilterSpecification;

  const underConstruction = [
    "all",
    inCategory,
    ["!=", ["get", "constructionStart"], null],
    ["<=", ["get", "constructionStart"], year],
    ["!", effectivelyOpened],
  ] as unknown as FilterSpecification;

  const future = [
    "all",
    inCategory,
    ["!", effectivelyOpened],
    [
      "any",
      ["==", ["get", "constructionStart"], null],
      [">", ["get", "constructionStart"], year],
    ],
  ] as unknown as FilterSpecification;

  return { opened, underConstruction, future };
}

/** "Future" (not yet started) lots only make sense at the present view. */
export function shouldShowFuture(year: number, nowYear: number): boolean {
  return year >= nowYear;
}

export const HARD_MIN_YEAR = 1850;

/**
 * Slider upper bound: at least nowYear + 5, but far enough to cover the
 * latest expected opening in the data (so future completion is reachable).
 */
export function computeMaxYear(
  features: ReadonlyArray<{ properties?: Record<string, unknown> | null }>,
  nowYear: number,
): number {
  let max = nowYear + 5;
  for (const f of features) {
    const v = f.properties?.expectedOpening;
    if (typeof v === "number" && v > max) max = v;
  }
  return max;
}

/**
 * Slider lower bound from the data: 5 years before the earliest known
 * date, clamped to [HARD_MIN_YEAR, 1970] so sparse datasets still get a
 * sensible default.
 */
export function computeMinYear(
  features: ReadonlyArray<{ properties?: Record<string, unknown> | null }>,
): number {
  let min = Infinity;
  for (const f of features) {
    for (const key of ["opened", "constructionStart"] as const) {
      const v = f.properties?.[key];
      if (typeof v === "number" && v < min) min = v;
    }
  }
  if (!Number.isFinite(min)) return 1970;
  return Math.max(HARD_MIN_YEAR, Math.min(1970, min - 5));
}

/** Parse a ?year= param, clamped to [min, max]; falls back to `fallback`. */
export function parseYearParam(
  raw: string | null,
  min: number,
  max: number,
  fallback: number,
): number {
  const y = Number(raw);
  if (!Number.isInteger(y) || y < min || y > max) return fallback;
  return y;
}

/** Parse a ?cat=highway,railway param; empty/invalid → all categories. */
export function parseCategoriesParam(raw: string | null): Set<Category> {
  if (!raw) return new Set(ALL_CATEGORIES);
  const valid = raw
    .split(",")
    .filter((c): c is Category => (ALL_CATEGORIES as string[]).includes(c));
  return valid.length > 0 ? new Set(valid) : new Set(ALL_CATEGORIES);
}

/** Serialize map state back to a query string (empty string when default). */
export function serializeMapParams(
  year: number,
  categories: ReadonlySet<Category>,
  selectedLotId: string | null,
  defaultYear: number,
  speedIndex?: number,
  defaultSpeedIndex?: number,
): string {
  const params = new URLSearchParams();
  if (year !== defaultYear) params.set("year", String(year));
  if (categories.size !== ALL_CATEGORIES.length) {
    params.set("cat", [...categories].sort().join(","));
  }
  if (selectedLotId) params.set("sel", selectedLotId);
  if (
    speedIndex !== undefined &&
    defaultSpeedIndex !== undefined &&
    speedIndex !== defaultSpeedIndex
  ) {
    params.set("speed", String(speedIndex));
  }
  return params.toString();
}
