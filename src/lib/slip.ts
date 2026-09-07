import { contractBaseline, contractMonths, monthIndex } from "./contract";
import type { Lot } from "./schema";

/**
 * Schedule slip: how far a lot ran past the delivery date its own contract
 * implied.
 *
 * The baseline is the contract, not a press announcement — start date (or
 * award date, when construction start is unknown) plus the contracted
 * design + execution months. That is the promise the public paid for, and
 * it is the only baseline that exists in the data for lots whose announced
 * opening dates were never recorded.
 */

/** Which date the contracted duration was measured from. */
export type SlipAnchor = "constructionStart" | "tenderAwarded";

/** What the planned date was compared against. */
export type SlipReference = "opened" | "expectedOpening" | "now";

export interface Slip {
  /** "completed" once the lot has opened; "ongoing" while it is still due. */
  kind: "completed" | "ongoing";
  /** Contract-implied completion, as an absolute month index. */
  plannedMonth: number;
  /** The month compared against it. */
  referenceMonth: number;
  reference: SlipReference;
  /** referenceMonth − plannedMonth. Negative means delivered early. */
  slipMonths: number;
  anchor: SlipAnchor;
  /**
   * Months added to the anchor to reach plannedMonth. Counted from
   * construction start this is the execution period alone, since the design
   * period has already run — see contractBaseline.
   */
  baselineMonths: number;
  /** Full contracted duration (design + execution), for context. */
  contractMonths: number;
}

/**
 * Slip for one lot, or null when the data cannot support a claim.
 *
 * Null is returned for lots without contracted durations, for cancelled
 * lots (there is no delivery to be late for), and — deliberately — for
 * in-progress lots that are neither past their contract date nor carrying
 * an announced opening. Those are not "on time", they are simply not yet
 * informative, and counting them as zero slip would flatter the averages.
 */
export function computeSlip(lot: Lot, nowMonth: number): Slip | null {
  if (lot.status === "cancelled") return null;
  if (!lot.contract) return null;

  const baseline = contractBaseline(lot);
  if (baseline === null) return null;

  const base = {
    plannedMonth: baseline.month,
    anchor: baseline.anchor,
    baselineMonths: baseline.months,
    contractMonths: contractMonths(lot.contract) ?? baseline.months,
  };
  const plannedMonth = baseline.month;

  if (lot.status === "opened") {
    const openedMonth = monthIndex(lot.dates?.opened);
    if (openedMonth === null) return null;
    return {
      ...base,
      kind: "completed",
      referenceMonth: openedMonth,
      reference: "opened",
      slipMonths: openedMonth - plannedMonth,
    };
  }

  const forecast = monthIndex(lot.dates?.expectedOpening);

  // A lot cannot be forecast to open before the contract that builds it was
  // awarded. When it is, the record contradicts itself and any slip derived
  // from it is fiction: A8 Moțca–Târgu Frumos carries tenderAwarded 2026-04
  // against expectedOpening 2026 and reported 42 months EARLY while still
  // under construction, which then dragged down its country's and its
  // builder's medians. Refuse, as this module does everywhere else it cannot
  // support a claim.
  const anchorMonth = baseline.month - baseline.months;
  if (forecast !== null && forecast < anchorMonth) return null;

  if (forecast === null) {
    // No announced date: the only evidence of slip is the calendar itself.
    if (nowMonth <= plannedMonth) return null;
    return {
      ...base,
      kind: "ongoing",
      referenceMonth: nowMonth,
      reference: "now",
      slipMonths: nowMonth - plannedMonth,
    };
  }

  // An announced date that has itself already passed tells us less than the
  // calendar does — take whichever is later.
  const referenceMonth = Math.max(forecast, nowMonth);
  return {
    ...base,
    kind: "ongoing",
    referenceMonth,
    reference: nowMonth > forecast ? "now" : "expectedOpening",
    slipMonths: referenceMonth - plannedMonth,
  };
}

// The definition lives beside monthIndex, where the month scale is set; the
// pages that measure slip keep importing it from here.
export { currentMonth } from "./contract";
