import type { FilterSpecification } from "maplibre-gl";
import { effectivelyOpenedFilter } from "./map-filters";
import { countsTowardNetwork } from "./schema";
import type { LotEntry } from "./lot-list";

/**
 * What changed between two months.
 *
 * The map could show the network at any month but never the difference
 * between two, which is the question the time slider invites: not "what
 * existed in 2020" but "what has been built since". The window is open at
 * the start and closed at the end, so a section that opened exactly on the
 * baseline month counts as already there.
 */
export interface DeltaWindow {
  /** Baseline month index, exclusive. */
  from: number;
  /** Viewed month index, inclusive. */
  to: number;
  nowMonth: number;
}

export interface Delta {
  /**
   * Every lot that became open inside the window, including the ones whose
   * kilometres another project already counts: they are real openings and
   * belong in the list, they just must not be added to the total.
   */
  lots: LotEntry[];
  /**
   * Kilometres, with anything another project already counts left out. This
   * is a total across every project on the map, so it answers to
   * `countsTowardNetwork`: both `sharedWith` (track another line owns) and
   * `partOf` (works inside a section its parent already measures). See
   * AGENTS.md. Applying only the first added the eleven A1/A3/A8 tunnels on
   * top of the sections containing them, as soon as the slider passed their
   * expected opening.
   */
  km: number;
  /** The kilometres held back from `km`, reported separately. */
  alsoCountedKm: number;
  /** How much of `km` rests on a projected date rather than a published one. */
  projectedKm: number;
  count: number;
}

/** One decimal: the underlying lengths are published to that precision. */
function round(km: number): number {
  return Math.round(km * 10) / 10;
}

function isOpenAt(lot: LotEntry, month: number, nowMonth: number): boolean {
  if (lot.openedMonth !== null && lot.openedMonth <= month) return true;
  return (
    month > nowMonth &&
    lot.expectedOpeningMonth !== null &&
    lot.expectedOpeningMonth <= month
  );
}

/** The lots that became open in the window, and how much track that is. */
export function openedBetween(
  lots: readonly LotEntry[],
  { from, to, nowMonth }: DeltaWindow,
): Delta {
  const found: LotEntry[] = [];
  let km = 0;
  let alsoCountedKm = 0;
  let projectedKm = 0;

  if (to > from) {
    for (const lot of lots) {
      if (!isOpenAt(lot, to, nowMonth)) continue;
      if (isOpenAt(lot, from, nowMonth)) continue;
      found.push(lot);
      if (!countsTowardNetwork(lot)) {
        alsoCountedKm += lot.lengthKm;
        continue;
      }
      km += lot.lengthKm;
      // Open on a projection rather than a record: worth flagging, because
      // the figure is a forecast wherever this is not zero.
      if (lot.openedMonth === null) projectedKm += lot.lengthKm;
    }
  }

  return {
    lots: found,
    km: round(km),
    alsoCountedKm: round(alsoCountedKm),
    projectedKm: round(projectedKm),
    count: found.length,
  };
}

/**
 * The same set as an expression, for the highlight layer.
 *
 * Deliberately carries no zoom term, so it composes with a layer whose
 * width is a zoom interpolate: only one zoom-dependent interpolate is
 * allowed per expression and it has to be the outermost one.
 */
export function newlyOpenedFilter({
  from,
  to,
  nowMonth,
}: DeltaWindow): FilterSpecification {
  if (to <= from) {
    return ["==", ["get", "lotId"], "__never__"] as unknown as FilterSpecification;
  }
  return [
    "all",
    effectivelyOpenedFilter(to, nowMonth),
    ["!", effectivelyOpenedFilter(from, nowMonth)],
  ] as unknown as FilterSpecification;
}
