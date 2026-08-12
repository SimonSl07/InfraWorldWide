import type { FilterSpecification } from "maplibre-gl";
import type { Category, Status } from "./schema";
import { ALL_CATEGORIES, MAP_STATUSES } from "./map-style";

/**
 * Pure map-state logic, kept separate from React components so it can be
 * unit-tested. All functions return MapLibre style expressions.
 */

/**
 * Which lot statuses are shown, per category. A category missing from the
 * map is hidden entirely; a category present with a subset of statuses shows
 * only those (e.g. railways without the tendered ones). An empty status set
 * is equivalent to the category being absent.
 *
 * Statuses are matched against a lot's status *at the year being viewed*,
 * not the status it carries today: scrubbing to 2010 with only "under
 * construction" ticked shows what was a building site in 2010. Lots that
 * hadn't started yet by then have no historical status to derive, so there
 * the declared one (tendered/planned) is used.
 */
export type CategoryStatusSelection = ReadonlyMap<Category, ReadonlySet<Status>>;

/** Statuses ordered as in MAP_STATUSES, for stable URLs and menus. */
function orderStatuses(statuses: ReadonlySet<Status>): Status[] {
  return MAP_STATUSES.filter((s) => statuses.has(s));
}

/** Every given category with all of its statuses shown (the default). */
export function fullSelection(
  categories: Iterable<Category> = ALL_CATEGORIES,
): CategoryStatusSelection {
  return new Map([...categories].map((c) => [c, new Set(MAP_STATUSES)]));
}

/** Categories with at least one visible status. */
export function selectionCategories(
  selection: CategoryStatusSelection,
): Set<Category> {
  return new Set(
    [...selection.entries()].filter(([, s]) => s.size > 0).map(([c]) => c),
  );
}

export function isCategoryActive(
  selection: CategoryStatusSelection,
  category: Category,
): boolean {
  return (selection.get(category)?.size ?? 0) > 0;
}

export function isStatusActive(
  selection: CategoryStatusSelection,
  category: Category,
  status: Status,
): boolean {
  return selection.get(category)?.has(status) ?? false;
}

/** Toggle a whole category: off, or back on with all statuses restored. */
export function toggleCategory(
  selection: CategoryStatusSelection,
  category: Category,
): CategoryStatusSelection {
  const next = new Map(selection);
  if (isCategoryActive(selection, category)) next.delete(category);
  else next.set(category, new Set(MAP_STATUSES));
  return next;
}

/**
 * Toggle one status within a category. Removing the last visible status
 * switches the category off, so the pill and the menu never disagree.
 */
export function toggleStatus(
  selection: CategoryStatusSelection,
  category: Category,
  status: Status,
): CategoryStatusSelection {
  const next = new Map(selection);
  const current = new Set(selection.get(category) ?? []);
  if (current.has(status)) current.delete(status);
  else current.add(status);
  if (current.size === 0) next.delete(category);
  else next.set(category, current);
  return next;
}

/** Show or hide every status of one category at once. */
export function setCategoryStatuses(
  selection: CategoryStatusSelection,
  category: Category,
  statuses: Iterable<Status>,
): CategoryStatusSelection {
  const next = new Map(selection);
  const set = new Set(statuses);
  if (set.size === 0) next.delete(category);
  else next.set(category, set);
  return next;
}

export interface MonthFilters {
  /** Lots opened on or before the month. */
  opened: FilterSpecification;
  /** Lots whose construction started but hadn't opened yet in the month. */
  underConstruction: FilterSpecification;
  /** Lots not yet started in the month (only rendered at "present"). */
  future: FilterSpecification;
}

/**
 * Categories whose menu still has `status` ticked. Used for the layers whose
 * status is implied by the year — a feature drawn in the "opened" layer is
 * opened at that year whatever its declared status says.
 */
export function buildCategoryFilter(
  selection: CategoryStatusSelection,
  status: Status,
): FilterSpecification {
  const categories = [...selection.entries()]
    .filter(([, statuses]) => statuses.has(status))
    .map(([category]) => category);
  return [
    "in",
    ["get", "category"],
    ["literal", categories],
  ] as unknown as FilterSpecification;
}

/**
 * Category + declared-status membership as one expression: a feature passes
 * when its category is shown and its status is among those kept for that
 * category. Used for the not-yet-started layer, where the lot's own status
 * (tendered/planned) is the only status there is.
 */
export function buildSelectionFilter(
  selection: CategoryStatusSelection,
): FilterSpecification {
  const clauses = [...selection.entries()]
    .filter(([, statuses]) => statuses.size > 0)
    .map(([category, statuses]) =>
      statuses.size === MAP_STATUSES.length
        ? ["==", ["get", "category"], category]
        : [
            "all",
            ["==", ["get", "category"], category],
            ["in", ["get", "status"], ["literal", orderStatuses(statuses)]],
          ],
    );
  // Nothing selected: an empty category list matches no feature.
  if (clauses.length === 0) {
    return ["in", ["get", "category"], ["literal", []]] as unknown as FilterSpecification;
  }
  return ["any", ...clauses] as unknown as FilterSpecification;
}

/**
 * Layer filters for one month of the timeline.
 *
 * `month` and `nowMonth` are absolute month indices (year*12 + month-1), so
 * a lot appears on the first of the month it opened and not a day earlier.
 */
export function buildMonthFilters(
  month: number,
  selection: CategoryStatusSelection,
  nowMonth: number,
): MonthFilters {
  // Each layer answers to the checkbox for the status it represents in the
  // viewed month; the not-yet-started layer falls back to declared status.
  const openedCategories = buildCategoryFilter(selection, "opened");
  const buildingCategories = buildCategoryFilter(selection, "under_construction");
  const notStartedSelection = buildSelectionFilter(selection);

  // "Effectively opened" in the selected month: actually opened — or, when
  // viewing the future, past its expected opening month.
  const openedByMonth = [
    "all",
    ["!=", ["get", "openedMonth"], null],
    ["<=", ["get", "openedMonth"], month],
  ] as unknown as FilterSpecification;
  const effectivelyOpened =
    month > nowMonth
      ? ([
          "any",
          openedByMonth,
          [
            "all",
            ["!=", ["get", "expectedOpeningMonth"], null],
            ["<=", ["get", "expectedOpeningMonth"], month],
          ],
        ] as unknown as FilterSpecification)
      : openedByMonth;

  const opened = [
    "all",
    openedCategories,
    effectivelyOpened,
  ] as unknown as FilterSpecification;

  const underConstruction = [
    "all",
    buildingCategories,
    ["!=", ["get", "constructionStartMonth"], null],
    ["<=", ["get", "constructionStartMonth"], month],
    ["!", effectivelyOpened],
  ] as unknown as FilterSpecification;

  // A missing construction start means two different things. For a lot we know
  // opened, it is simply unrecorded history — common for motorway sections old
  // enough that no start date was ever published — and the lot must appear the
  // month it opened, never as a planned road for the decades before. Only when
  // neither date is known is the lot genuinely not yet started.
  const future = [
    "all",
    notStartedSelection,
    ["!", effectivelyOpened],
    [
      "any",
      [
        "all",
        ["==", ["get", "constructionStartMonth"], null],
        ["==", ["get", "openedMonth"], null],
      ],
      // The null check has to gate the comparison: ">" raises on a null
      // operand rather than returning false.
      [
        "all",
        ["!=", ["get", "constructionStartMonth"], null],
        [">", ["get", "constructionStartMonth"], month],
      ],
    ],
  ] as unknown as FilterSpecification;

  return { opened, underConstruction, future };
}

/** "Future" (not yet started) lots only make sense at the present view. */
export function shouldShowFuture(month: number, nowMonth: number): boolean {
  return month >= nowMonth;
}

export const HARD_MIN_YEAR = 1850;
export const HARD_MIN_MONTH = HARD_MIN_YEAR * 12;

/** Absolute month index for a year and 1-based month. */
export function toMonthIndex(year: number, month = 1): number {
  return year * 12 + (month - 1);
}

/** Split a month index back into a year and 1-based month. */
export function fromMonthIndex(index: number): { year: number; month: number } {
  const year = Math.floor(index / 12);
  return { year, month: index - year * 12 + 1 };
}

/**
 * Slider upper bound: at least five years out, and far enough to cover the
 * latest expected opening in the data so future completion is reachable.
 */
export function computeMaxMonth(
  features: ReadonlyArray<{ properties?: Record<string, unknown> | null }>,
  nowMonth: number,
): number {
  let max = nowMonth + 5 * 12;
  for (const f of features) {
    const v = f.properties?.expectedOpeningMonth;
    if (typeof v === "number" && v > max) max = v;
  }
  return max;
}

/**
 * Slider lower bound from the data: five years before the earliest known
 * date, clamped so sparse datasets still start no later than January 1970.
 */
export function computeMinMonth(
  features: ReadonlyArray<{ properties?: Record<string, unknown> | null }>,
): number {
  let min = Infinity;
  for (const f of features) {
    for (const key of ["openedMonth", "constructionStartMonth"] as const) {
      const v = f.properties?.[key];
      if (typeof v === "number" && v < min) min = v;
    }
  }
  if (!Number.isFinite(min)) return toMonthIndex(1970);
  return Math.max(HARD_MIN_MONTH, Math.min(toMonthIndex(1970), min - 5 * 12));
}

/**
 * Parse a ?t=YYYY-MM param to a month index, clamped to [min, max].
 * A bare ?t=YYYY is accepted and resolves to that January.
 */
export function parseMonthParam(
  raw: string | null,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!raw) return fallback;
  const m = raw.match(/^(\d{4})(?:-(\d{1,2}))?$/);
  if (!m) return fallback;
  const year = Number(m[1]);
  const month = m[2] === undefined ? 1 : Number(m[2]);
  if (month < 1 || month > 12) return fallback;
  const index = toMonthIndex(year, month);
  if (index < min || index > max) return fallback;
  return index;
}

/** Month index as the "YYYY-MM" used in URLs. */
export function formatMonthParam(index: number): string {
  const { year, month } = fromMonthIndex(index);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Parse a ?cat=highway,railway param; empty/invalid → all categories. */
export function parseCategoriesParam(raw: string | null): Set<Category> {
  if (!raw) return new Set(ALL_CATEGORIES);
  const valid = raw
    .split(",")
    .filter((c): c is Category => (ALL_CATEGORIES as string[]).includes(c));
  return valid.length > 0 ? new Set(valid) : new Set(ALL_CATEGORIES);
}

/**
 * Parse a ?st=railway:opened.planned,bridge:opened param into per-category
 * status subsets, layered on the categories from ?cat=. Entries for hidden
 * categories, unknown categories/statuses and empty subsets are ignored, so
 * a mangled param degrades to "show everything in those categories".
 */
export function parseSelectionParam(
  categoriesRaw: string | null,
  statusesRaw: string | null,
): CategoryStatusSelection {
  const selection = new Map(fullSelection(parseCategoriesParam(categoriesRaw)));
  if (!statusesRaw) return selection;

  for (const entry of statusesRaw.split(",")) {
    const [category, list] = entry.split(":");
    if (!selection.has(category as Category) || !list) continue;
    const statuses = list
      .split(".")
      .filter((s): s is Status => (MAP_STATUSES as string[]).includes(s));
    if (statuses.length > 0) {
      selection.set(category as Category, new Set(statuses));
    }
  }
  return selection;
}

/** Serialize map state back to a query string (empty string when default). */
export function serializeMapParams(
  month: number,
  selection: CategoryStatusSelection,
  selectedLotId: string | null,
  defaultMonth: number,
  speedIndex?: number,
  defaultSpeedIndex?: number,
): string {
  const params = new URLSearchParams();
  if (month !== defaultMonth) params.set("t", formatMonthParam(month));
  const categories = selectionCategories(selection);
  if (categories.size !== ALL_CATEGORIES.length) {
    params.set("cat", [...categories].sort().join(","));
  }
  const partial = [...selection.entries()]
    .filter(([, s]) => s.size > 0 && s.size !== MAP_STATUSES.length)
    .map(([c, s]) => `${c}:${orderStatuses(s).join(".")}`)
    .sort();
  if (partial.length > 0) params.set("st", partial.join(","));
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
