import type { Contract, Lot } from "./schema";
import { formatMoney } from "./format";

/**
 * Contract terms as short inline labels ("6 mo design · 24 mo execution ·
 * Contract value €313M"). Takes a translate function so it works in both
 * server and client components.
 */
export function contractSummaryParts(
  contract: Contract,
  t: (key: string, values?: Record<string, string | number>) => string,
  locale = "en",
): string[] {
  const parts: string[] = [];
  if (contract.designMonths) {
    parts.push(t("project.contractDesign", { months: contract.designMonths }));
  }
  if (contract.executionMonths) {
    parts.push(
      t("project.contractExecution", { months: contract.executionMonths }),
    );
  }
  if (contract.totalMonths) {
    parts.push(t("project.contractTotal", { months: contract.totalMonths }));
  }
  if (contract.guaranteeMonths) {
    parts.push(
      t("project.contractGuarantee", { months: contract.guaranteeMonths }),
    );
  }
  if (contract.value) {
    parts.push(
      `${t("project.contractValue")} ${formatMoney(contract.value, locale)}`,
    );
  }
  return parts;
}

/** Total contracted months: explicit total, else design + execution. */
export function contractMonths(contract: Contract): number | null {
  if (contract.totalMonths) return contract.totalMonths;
  const sum = (contract.designMonths ?? 0) + (contract.executionMonths ?? 0);
  return sum > 0 ? sum : null;
}

/**
 * Absolute month index for a partial ISO date, counting months from year 0
 * ("2012" → January 2012, "2012-06" → June 2012). Lets dates of different
 * precision be compared and subtracted. Null when unparseable.
 */
export function monthIndex(date: string | undefined): number | null {
  if (!date) return null;
  const year = parseInt(date.slice(0, 4), 10);
  if (!Number.isInteger(year)) return null;
  // Month is 1-based in the string; default to January when absent.
  const month = date.length >= 7 ? parseInt(date.slice(5, 7), 10) : 1;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
}

/**
 * Absolute month index for "now", on the scale `monthIndex` uses.
 *
 * Read in UTC, deliberately. The pages are rendered on a server whose clock
 * is UTC while the map runs in the reader's browser, and for the hours
 * either side of a month boundary a local reading would put the two a
 * month apart: the map drawing a lot as open while the panel beside it
 * still said "next month". One definition, one clock, so every "has this
 * happened yet" comparison in the app agrees.
 */
export function currentMonth(now: Date = new Date()): number {
  return now.getUTCFullYear() * 12 + now.getUTCMonth();
}

/**
 * Projected completion as an absolute month index: start date plus the
 * contracted duration. Null when either side is unknown.
 */
export function projectedCompletionMonth(
  startDate: string | undefined,
  contract: Contract | undefined,
): number | null {
  if (!contract) return null;
  const months = contractMonths(contract);
  if (months === null) return null;
  const start = monthIndex(startDate);
  if (start === null) return null;
  return start + months;
}

/**
 * Projected completion year from a start date plus the contracted duration
 * ("YYYY", "YYYY-MM" or "YYYY-MM-DD" + N months). Returns null when either
 * side is unknown. This is a *derived estimate* — `dates.expectedOpening`
 * always wins when a source states one explicitly.
 */
export function projectedCompletionYear(
  startDate: string | undefined,
  contract: Contract | undefined,
): number | null {
  const month = projectedCompletionMonth(startDate, contract);
  return month === null ? null : Math.floor(month / 12);
}

/** Which recorded date a contract-derived deadline is counted from. */
export type ContractAnchor = "constructionStart" | "tenderAwarded";

export interface ContractBaseline {
  /** Contract-implied completion, as an absolute month index. */
  month: number;
  anchor: ContractAnchor;
  /** Months added to the anchor — not always the full contracted duration. */
  months: number;
}

/**
 * The date a lot's contract implied it would be finished.
 *
 * Which duration applies depends on what the anchor date *means*. Counted
 * from the award, the whole contracted clock runs — design and then
 * execution. Counted from construction start, the design period has already
 * elapsed, so adding it again hands the project months it was never
 * promised, and can turn a late delivery into an early one.
 *
 * Preference order:
 *   1. construction start + contracted execution — the tightest pairing,
 *      a physical start measured against a physical duration
 *   2. tender award + the full contracted duration
 *   3. construction start + a lone combined total, when nothing else is
 *      available. Over-generous if that total hides a design period, but it
 *      is the only baseline such data supports.
 */
export function contractBaseline(lot: Lot): ContractBaseline | null {
  const contract = lot.contract;
  if (!contract) return null;

  const start = monthIndex(lot.dates?.constructionStart);
  const award = monthIndex(lot.dates?.tenderAwarded);
  const total = contractMonths(contract);

  if (start !== null && contract.executionMonths) {
    return {
      month: start + contract.executionMonths,
      anchor: "constructionStart",
      months: contract.executionMonths,
    };
  }
  if (award !== null && total !== null) {
    return { month: award + total, anchor: "tenderAwarded", months: total };
  }
  if (start !== null && total !== null) {
    return { month: start + total, anchor: "constructionStart", months: total };
  }
  return null;
}

/**
 * The year a lot is expected to be in service: an explicitly sourced
 * `expectedOpening` if present, otherwise derived from the contract terms.
 * Null for lots already in service or cancelled — there `dates.opened`
 * is the fact and a contract-derived estimate would be noise.
 */
export function expectedOpeningYear(lot: Lot): number | null {
  const month = expectedOpeningMonth(lot);
  return month === null ? null : Math.floor(month / 12);
}

/**
 * Expected opening as an absolute month index — the month-precision twin of
 * `expectedOpeningYear`, used by the map's monthly timeline. A year-only
 * `expectedOpening` resolves to that January, since nothing finer is known.
 */
export function expectedOpeningMonth(lot: Lot): number | null {
  if (lot.status === "opened" || lot.status === "cancelled") return null;
  if (lot.dates?.expectedOpening) return monthIndex(lot.dates.expectedOpening);
  return contractBaseline(lot)?.month ?? null;
}
