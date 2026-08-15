import { leaders } from "./compare";

/**
 * Which end of a comparison row is the good end.
 *
 * Most rows are longer-is-more: kilometres open, projects tracked. Delivery
 * rows are the opposite. Less delay, a smaller overrun and a cheaper
 * kilometre are the better outcome, and highlighting the largest figure there
 * would praise the worst performer.
 */
export type LeadDirection = "highest" | "lowest";

/**
 * Leading entries of a row, read in the given direction.
 *
 * "highest" is `leaders()` unchanged. "lowest" keeps its two honest rules,
 * fewer than two measured values is not a comparison and an all-round tie
 * leads nothing, but drops the "a maximum of zero leads nothing" rule: zero
 * months of delay and a zero overrun are results, not absent data.
 */
export function leadersBy(
  values: Array<number | null>,
  direction: LeadDirection,
): number[] {
  if (direction === "highest") return leaders(values);

  const measured = values
    .map((value, index) => ({ value, index }))
    .filter((e): e is { value: number; index: number } => e.value !== null);

  if (measured.length < 2) return [];

  const min = Math.min(...measured.map((e) => e.value));
  const best = measured.filter((e) => e.value === min);
  if (best.length === measured.length) return [];

  return best.map((e) => e.index);
}
