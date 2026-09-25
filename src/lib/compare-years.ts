/**
 * Choosing the two years of the before/after comparison.
 *
 * The comparison used to be a fixed offset (five years back from wherever
 * the slider sat) with no control of its own, so the year on the left of
 * the handle was a number the reader could see but not set. Here the two
 * sides are months in their own right, and the offset presets are one way
 * of setting one of them rather than the only way.
 *
 * The distinction that matters is `pinned`. Left alone, the baseline
 * follows the slider at a constant offset, which is what makes scrubbing
 * read as "what has been built in the last five years" at every date.
 * Once the reader nudges the left year directly they have named a year,
 * not an offset, and it must stay where they put it.
 */

/** Offsets offered as presets, in years before the viewed month. */
export const BASELINE_YEARS = [1, 5, 10, 20] as const;

export interface CompareBaseline {
  /** Offset preset in years, used while nothing is pinned. */
  years: number;
  /** An absolute month the reader chose, or null to follow the slider. */
  pinned: number | null;
}

/**
 * The month on the left of the handle: the pinned month when there is one,
 * otherwise the current offset applied to the viewed month.
 *
 * Never later than the month on the right. The two timelines run the whole
 * range each, so the left thumb can be dragged past the right one, and a
 * window that runs backwards reads as an empty comparison with no reason
 * given. Clamping the result rather than the pin means dragging the right
 * thumb back up restores the month the reader chose.
 */
export function baselineMonth(
  month: number,
  baseline: CompareBaseline,
): number {
  return Math.min(baseline.pinned ?? month - baseline.years * 12, month);
}

/**
 * Recover a shared link's baseline from the `cmp` month it encoded.
 *
 * `cmp` is written as an absolute month, so it has to be read back against
 * the month that link also carries. Reading it against today instead turned
 * `?t=2010-01&cmp=2005-01` into 1990 vs 2010, because the 21-year gap to
 * today snapped to the 20-year preset.
 *
 * An offset that lands exactly on a preset is restored as that preset, so a
 * link made without touching the year controls keeps following the slider.
 * Anything else is a year the reader named, and is pinned.
 */
export function readCompareBaseline(
  cmpMonth: number,
  month: number,
  fallbackYears: number,
): CompareBaseline {
  const preset = BASELINE_YEARS.find((y) => month - y * 12 === cmpMonth);
  if (preset !== undefined) return { years: preset, pinned: null };
  return { years: fallbackYears, pinned: cmpMonth };
}
