import type { Deflator } from "./deflator";
import type { Lot, Money } from "./schema";

/**
 * Cost overrun: what a lot ended up costing against what it was supposed to.
 *
 * Two baselines are reported separately and never mixed, because they answer
 * different questions:
 *
 *   "estimate" — `cost.estimated` → `cost.actual`. How good the pre-tender
 *                estimate was. Includes everything that happened afterwards,
 *                scope changes included.
 *   "award"    — `contract.value` → `cost.actual`. How far the signed price
 *                held. This is the accountability figure: the contractor bid
 *                a number and the public paid another.
 *
 * Both figures are restated into a common price year before the comparison,
 * so an estimate made in 2013 is not silently measured against money spent
 * in 2023.
 */

export type OverrunBasis = "estimate" | "award";

export type OverrunFailure =
  /** No `cost.estimated` (basis "estimate") or `contract.value` (basis "award"). */
  | "missing_baseline"
  /** No `cost.actual` — nothing to compare against yet. */
  | "missing_actual"
  /** Baseline and actual are in different currencies; no FX rates are held. */
  | "currency_mismatch"
  /** A price year or currency is outside the deflator's coverage. */
  | "not_deflatable";

export interface Overrun {
  basis: OverrunBasis;
  /** As recorded, in its own price year. */
  baseline: Money;
  actual: Money;
  /** Restated into `priceYear`. */
  baselineReal: Money;
  actualReal: Money;
  priceYear: number;
  /** actualReal / baselineReal. 1.0 means delivered on budget. */
  ratio: number;
  /** Real-terms overrun as a percentage. Negative means under budget. */
  pct: number;
  /** The same figure ignoring inflation, for comparison. */
  nominalPct: number;
  /** True when both figures were already quoted in the same price year. */
  samePriceYear: boolean;
}

export type OverrunResult =
  | { ok: true; overrun: Overrun }
  | { ok: false; basis: OverrunBasis; reason: OverrunFailure };

export interface OverrunOptions {
  deflate: Deflator;
  /** Price year every comparison is expressed in. */
  priceYear: number;
}

function baselineFor(lot: Lot, basis: OverrunBasis): Money | undefined {
  return basis === "estimate" ? lot.cost?.estimated : lot.contract?.value;
}

/** Overrun for one lot on one basis. */
export function computeOverrun(
  lot: Lot,
  basis: OverrunBasis,
  { deflate, priceYear }: OverrunOptions,
): OverrunResult {
  const fail = (reason: OverrunFailure): OverrunResult => ({
    ok: false,
    basis,
    reason,
  });

  const baseline = baselineFor(lot, basis);
  if (!baseline) return fail("missing_baseline");

  const actual = lot.cost?.actual;
  if (!actual) return fail("missing_actual");

  // Converting between currencies would need FX rates for the right year,
  // which this dataset does not carry. Refuse rather than approximate.
  if (baseline.currency !== actual.currency) return fail("currency_mismatch");

  const baselineReal = deflate(baseline, priceYear);
  const actualReal = deflate(actual, priceYear);
  if (!baselineReal.ok || !actualReal.ok) return fail("not_deflatable");

  const ratio = actualReal.money.amount / baselineReal.money.amount;

  return {
    ok: true,
    overrun: {
      basis,
      baseline,
      actual,
      baselineReal: baselineReal.money,
      actualReal: actualReal.money,
      priceYear,
      ratio,
      pct: (ratio - 1) * 100,
      nominalPct: (actual.amount / baseline.amount - 1) * 100,
      samePriceYear: baseline.year === actual.year,
    },
  };
}

/** Both bases for one lot. */
export function computeOverruns(
  lot: Lot,
  opts: OverrunOptions,
): Record<OverrunBasis, OverrunResult> {
  return {
    estimate: computeOverrun(lot, "estimate", opts),
    award: computeOverrun(lot, "award", opts),
  };
}

/** Narrowing helper for filtering result lists. */
export function isOverrun(
  result: OverrunResult,
): result is { ok: true; overrun: Overrun } {
  return result.ok;
}
