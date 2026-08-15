import type { LotFeatureProperties } from "./map-features";
import {
  isCategoryActive,
  isStatusActive,
  shouldShowFuture,
  type CategoryStatusSelection,
} from "./map-filters";

/**
 * The map's contents as a list.
 *
 * Selection on the map runs through canvas clicks, which is no route at all
 * for a keyboard or a screen reader: there is no tab stop for a road. This
 * turns the same features into an ordinary list that can be tabbed, typed
 * into and read aloud, and it answers the search box on top of it.
 *
 * The visibility rule is deliberately a second implementation of the one in
 * buildMonthFilters, because MapLibre expressions cannot be evaluated
 * outside a map without pulling the style spec into the client bundle. The
 * two are pinned against each other in lot-list.test.ts.
 */

/**
 * The flattened lot properties the data build writes onto every feature.
 * Declared once in map-features.ts, which is also what the build is
 * annotated against.
 */
export type LotEntry = LotFeatureProperties;

/** Which of the map's three line layers a lot belongs in, if any. */
export type LotState = "opened" | "under_construction" | "future";

function isOpenedBy(
  lot: LotEntry,
  month: number,
  nowMonth: number,
): boolean {
  if (lot.openedMonth !== null && lot.openedMonth <= month) return true;
  // Looking into the future, an expected opening counts as an opening.
  return (
    month > nowMonth &&
    lot.expectedOpeningMonth !== null &&
    lot.expectedOpeningMonth <= month
  );
}

/**
 * The layer a lot would be drawn in for one month, ignoring the category and
 * status filters. Null when the map draws it nowhere.
 */
export function lotStateInMonth(
  lot: LotEntry,
  month: number,
  nowMonth: number,
): LotState | null {
  if (isOpenedBy(lot, month, nowMonth)) return "opened";
  if (
    lot.constructionStartMonth !== null &&
    lot.constructionStartMonth <= month
  ) {
    return "under_construction";
  }
  // Not yet started, and only meaningful at the present or later. A lot with
  // no construction start but a known opening is unrecorded history, not a
  // road that was never begun, so it is nowhere before it opened.
  if (!shouldShowFuture(month, nowMonth)) return null;
  const neverStarted =
    lot.constructionStartMonth === null && lot.openedMonth === null;
  const startsLater =
    lot.constructionStartMonth !== null && lot.constructionStartMonth > month;
  return neverStarted || startsLater ? "future" : null;
}

/** Whether the map is drawing this lot right now, filters included. */
export function isLotVisible(
  lot: LotEntry,
  selection: CategoryStatusSelection,
  month: number,
  nowMonth: number,
): boolean {
  const state = lotStateInMonth(lot, month, nowMonth);
  if (state === null) return false;
  // The opened and under-construction layers answer to the checkbox for the
  // status they represent in the viewed month, whatever the lot declares.
  if (state === "opened") return isStatusActive(selection, lot.category, "opened");
  if (state === "under_construction") {
    return isStatusActive(selection, lot.category, "under_construction");
  }
  // Nothing has happened yet, so the declared status is the only one there is.
  return (
    isCategoryActive(selection, lot.category) &&
    isStatusActive(selection, lot.category, lot.status as never)
  );
}

/** Every lot the map is currently drawing, in source order. */
export function visibleLots(
  features: ReadonlyArray<{ properties?: Record<string, unknown> | null }>,
  selection: CategoryStatusSelection,
  month: number,
  nowMonth: number,
): LotEntry[] {
  const out: LotEntry[] = [];
  for (const feature of features) {
    const props = feature.properties;
    // Bridges and tunnels carry a second midpoint Point feature with the
    // same properties; listing it would show every bridge twice.
    if (!props || props.marker === true) continue;
    const lot = props as unknown as LotEntry;
    if (isLotVisible(lot, selection, month, nowMonth)) out.push(lot);
  }
  return out;
}

/* ── Search ───────────────────────────────────────────────────────────── */

/** Lowercased and stripped of diacritics: nobody types "Sebeș". */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Default number of results the panel will show. */
export const SEARCH_LIMIT = 40;

/**
 * Lots matching a free-text query, project-name hits first.
 *
 * A blank query returns the list unchanged, which is what makes this double
 * as the plain "what is on the map" list.
 */
export function searchLots(
  lots: readonly LotEntry[],
  query: string,
  limit = SEARCH_LIMIT,
): LotEntry[] {
  const needle = fold(query.trim());
  if (!needle) return lots.slice(0, limit);

  const byName: LotEntry[] = [];
  const byLot: LotEntry[] = [];
  for (const lot of lots) {
    if (fold(lot.projectName).includes(needle)) byName.push(lot);
    else if (fold(lot.lotName).includes(needle)) byLot.push(lot);
  }
  return [...byName, ...byLot].slice(0, limit);
}
