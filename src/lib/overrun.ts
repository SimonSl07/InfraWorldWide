import type { Deflator } from "./deflator";
import type { Converter } from "./fx";
import { isComparableMoney, lotActualCost, lotEstimatedCost } from "./schema";
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
 *
 * When the two figures are in different currencies, supplying `convert` puts
 * them on one axis, always deflate-first-then-convert. Converting first would
 * apply a rate from one year to prices from another and fold inflation and
 * currency movement into one unattributable number. Without a converter the
 * comparison is refused rather than approximated.
 */

export type OverrunBasis = "estimate" | "award";

export type OverrunFailure =
  /** No `cost.estimated` (basis "estimate") or `contract.value` (basis "award"). */
  | "missing_baseline"
  /** No `cost.actual` — nothing to compare against yet. */
  | "missing_actual"
  /** Different currencies and no converter was supplied. */
  | "currency_mismatch"
  /** Different currencies, and one has no published rate for that year. */
  | "not_convertible"
  /** A price year or currency is outside the deflator's coverage. */
  | "not_deflatable"
  /**
   * A figure `isComparableMoney` rejects: no price year, or a scope that
   * covers something other than this lot. Distinct from "not_deflatable",
   * which is about the tables not reaching far enough; this is about the
   * figure not being the kind of thing a percentage may be taken of.
   */
  | "not_comparable";

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
  /**
   * The same figure ignoring inflation. Null across currencies, where a
   * nominal percentage would compare two different units of account.
   */
  nominalPct: number | null;
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
  /**
   * Optional. Supply it to compare figures recorded in different currencies.
   * Omitted, such a pair is refused with "currency_mismatch".
   */
  convert?: Converter;
}

function baselineFor(lot: Lot, basis: OverrunBasis): Money | undefined {
  // The estimate is read through the derived view, so a cost recorded as a
  // revision chain is measured the same as one recorded in `cost.estimated`.
  return basis === "estimate"
    ? (lotEstimatedCost(lot) ?? undefined)
    : lot.contract?.value;
}

/** Overrun for one lot on one basis. */
export function computeOverrun(
  lot: Lot,
  basis: OverrunBasis,
  { deflate, priceYear, convert }: OverrunOptions,
): OverrunResult {
  const fail = (reason: OverrunFailure): OverrunResult => ({
    ok: false,
    basis,
    reason,
  });

  const baseline = baselineFor(lot, basis);
  if (!baseline) return fail("missing_baseline");

  const actual = lotActualCost(lot);
  if (!actual) return fail("missing_actual");

  // The policy gate, applied before any arithmetic: a figure with no price
  // year or a scope wider than this lot is shown as recorded everywhere else,
  // and never turned into a percentage here. The deflator would refuse the
  // first case anyway; the second it would happily restate.
  if (!isComparableMoney(baseline) || !isComparableMoney(actual)) {
    return fail("not_comparable");
  }

  const sameCurrency = baseline.currency === actual.currency;
  if (!sameCurrency && !convert) return fail("currency_mismatch");

  // Step 1: restate within each figure's own currency.
  const baselineDeflated = deflate(baseline, priceYear);
  const actualDeflated = deflate(actual, priceYear);
  if (!baselineDeflated.ok || !actualDeflated.ok) return fail("not_deflatable");

  let baselineReal = baselineDeflated.money;
  let actualReal = actualDeflated.money;

  // Step 2: only now convert, at the common price year's rate.
  if (!sameCurrency && convert) {
    const baselineConverted = convert(baselineReal);
    const actualConverted = convert(actualReal);
    if (!baselineConverted.ok || !actualConverted.ok) {
      return fail("not_convertible");
    }
    baselineReal = baselineConverted.money;
    actualReal = actualConverted.money;
  }

  const ratio = actualReal.amount / baselineReal.amount;

  return {
    ok: true,
    overrun: {
      basis,
      // The figures as recorded, each still in its own currency and year.
      baseline,
      actual,
      baselineReal,
      actualReal,
      priceYear,
      ratio,
      pct: (ratio - 1) * 100,
      nominalPct: sameCurrency
        ? (actual.amount / baseline.amount - 1) * 100
        : null,
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
