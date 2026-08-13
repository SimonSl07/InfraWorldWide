/**
 * Which entries lead a row of a side-by-side comparison.
 *
 * Deliberately conservative about what counts as leading, because a
 * highlight is a claim:
 *
 *  - Fewer than two measured values is not a comparison. One country with a
 *    figure and one without does not make the first a leader, it makes the
 *    second unknown.
 *  - A maximum of zero leads nothing. Every country having no tunnels is not
 *    a three-way tie for best tunnels.
 *  - If every measured value ties, nobody leads. Highlighting all of them
 *    would say precisely nothing while looking like it said something.
 *
 * A genuine tie between some but not all entries returns every tied index,
 * so two countries level on 100 km against a third on 50 are both marked.
 */
export function leaders(values: Array<number | null>): number[] {
  const measured = values
    .map((value, index) => ({ value, index }))
    .filter((e): e is { value: number; index: number } => e.value !== null);

  if (measured.length < 2) return [];

  const max = Math.max(...measured.map((e) => e.value));
  if (max <= 0) return [];

  const best = measured.filter((e) => e.value === max);
  if (best.length === measured.length) return [];

  return best.map((e) => e.index);
}
