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
    parts.push(`${t("project.contractValue")} ${formatMoney(contract.value)}`);
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
 * Projected completion year from a start date plus the contracted duration
 * ("YYYY", "YYYY-MM" or "YYYY-MM-DD" + N months). Returns null when either
 * side is unknown. This is a *derived estimate* — `dates.expectedOpening`
 * always wins when a source states one explicitly.
 */
export function projectedCompletionYear(
  startDate: string | undefined,
  contract: Contract | undefined,
): number | null {
  if (!startDate || !contract) return null;
  const months = contractMonths(contract);
  if (months === null) return null;
  const year = parseInt(startDate.slice(0, 4), 10);
  if (!Number.isInteger(year)) return null;
  // Month is 1-based in the string; default to January when absent.
  const month = startDate.length >= 7 ? parseInt(startDate.slice(5, 7), 10) : 1;
  if (!Number.isInteger(month)) return null;
  const zeroBased = year * 12 + (month - 1) + months;
  return Math.floor(zeroBased / 12);
}

/**
 * The year a lot is expected to be in service: an explicitly sourced
 * `expectedOpening` if present, otherwise derived from the contract terms.
 * Null for lots already in service or cancelled — there `dates.opened`
 * is the fact and a contract-derived estimate would be noise.
 */
export function expectedOpeningYear(lot: Lot): number | null {
  if (lot.status === "opened" || lot.status === "cancelled") return null;
  if (lot.dates?.expectedOpening) {
    return parseInt(lot.dates.expectedOpening.slice(0, 4), 10);
  }
  return projectedCompletionYear(
    lot.dates?.constructionStart ?? lot.dates?.tenderAwarded,
    lot.contract,
  );
}
