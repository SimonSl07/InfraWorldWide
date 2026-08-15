import { lotCostRows, type CostOptions } from "./performance";
import {
  crossProjectMetrics,
  rankByCountry,
  type LotMetric,
} from "./rankings";

/**
 * A country's delivery record as one row: how late it runs, how often it
 * lands on the contract date, how far over the estimate it goes, and what a
 * kilometre costs.
 *
 * These are the same measures the performance page ranks countries on, so the
 * comparison table and /rankings cannot disagree about the same country. All
 * of it is derived, so a country with no contracted durations or no outturn
 * costs comes back with nulls rather than with zeroes that would read as a
 * clean record.
 *
 * Track shared with another line is excluded throughout: these are totals
 * across projects, and a tunnel two metro lines run through would otherwise
 * be paid for twice.
 */
export interface CountryPerformance {
  /** ISO 3166-1 alpha-2, lowercase. */
  code: string;
  /** Lots counted, excluding shared track. */
  lots: number;
  km: number;
  /** Median schedule slip in months; negative is early. */
  medianSlip: number | null;
  /** Lots the median slip was measured on. */
  slipN: number;
  /** Share of delivered lots that met the contract date, 0 to 1. */
  onTimeShare: number | null;
  /** Median overrun against the pre-tender estimate, in percent. */
  medianOverrun: number | null;
  overrunN: number;
  /**
   * Comparable cost per kilometre: every figure deflated within its own
   * currency to the common price year, then converted, then divided by the
   * length that actually carried a figure. Null when nothing could be
   * restated.
   */
  costPerKm: number | null;
  /** Currency the cost figures were converted to, for the label. */
  costCurrency: string | null;
  costedLots: number;
  costedKm: number;
}

interface CostTotal {
  amount: number;
  km: number;
  lots: number;
  currency: string;
}

export function countryPerformance(
  metrics: LotMetric[],
  options: CostOptions,
): CountryPerformance[] {
  const costs = new Map<string, CostTotal>();
  // A country total spans projects, so lots already counted elsewhere go,
  // cost and kilometres together: keeping a contained tunnel's cost while
  // dropping its length would inflate the country's cost per kilometre.
  for (const row of lotCostRows(crossProjectMetrics(metrics), options)) {
    const comparable = row.cost.comparable;
    if (!comparable || row.metric.lengthKm <= 0) continue;
    const total = costs.get(row.metric.country) ?? {
      amount: 0,
      km: 0,
      lots: 0,
      currency: comparable.currency,
    };
    total.amount += comparable.amount;
    total.km += row.metric.lengthKm;
    total.lots += 1;
    costs.set(row.metric.country, total);
  }

  return rankByCountry(metrics)
    .map((group) => {
      const cost = costs.get(group.key) ?? null;
      return {
        code: group.key,
        lots: group.lots,
        km: group.km,
        medianSlip: group.slip.median,
        slipN: group.slip.n,
        onTimeShare: group.onTimeShare,
        medianOverrun: group.overrun.estimate.median,
        overrunN: group.overrun.estimate.n,
        costPerKm: cost && cost.km > 0 ? cost.amount / cost.km : null,
        costCurrency: cost?.currency ?? null,
        costedLots: cost?.lots ?? 0,
        costedKm: cost?.km ?? 0,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** The row for one country, or null when it has no measured lots. */
export function findCountryPerformance(
  rows: CountryPerformance[],
  code: string,
): CountryPerformance | null {
  return rows.find((r) => r.code === code) ?? null;
}
