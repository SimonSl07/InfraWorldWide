import type { Deflator } from "./deflator";
import type { Converter } from "./fx";
import {
  COST_BASES,
  type CostBasis,
  type GroupRanking,
  type LotMetric,
} from "./rankings";
import type { LocalizedString, Money } from "./schema";

/**
 * Cost rows for the performance tables: what a section cost, and what a
 * kilometre of it cost, on one axis.
 *
 * "One axis" is the whole difficulty. A figure in this dataset carries both
 * a currency and a price year, and two costs are only comparable once both
 * are reconciled. The order is fixed and matters:
 *
 *   deflate within the currency → convert at that year's rate
 *
 * Either step can refuse (a currency with no published rates, a price year
 * outside the series). When it does, `comparable` is null and the row drops
 * out of any ranking rather than being sorted on a number that means
 * something different from its neighbours. The recorded figure is still
 * shown, because it is a fact even when it is not comparable.
 */

export interface CostOptions {
  deflate: Deflator;
  convert: Converter;
  /** Price year every comparable figure is expressed in. */
  priceYear: number;
}

export interface ComparableCost {
  basis: CostBasis;
  /** As recorded, in its own currency and price year. */
  recorded: Money;
  /** Restated into the base currency at `priceYear` prices, when possible. */
  comparable: Money | null;
}

/**
 * The best cost figure a lot has, preferring what was actually paid over
 * what was signed over what was guessed. Null when it has none.
 */
export function bestCost(metric: LotMetric): { basis: CostBasis; money: Money } | null {
  for (const basis of COST_BASES) {
    const money = metric.costs[basis];
    if (money) return { basis, money };
  }
  return null;
}

/** Restates one recorded figure onto the common axis. */
export function toComparable(
  money: Money,
  { deflate, convert, priceYear }: CostOptions,
): Money | null {
  const real = deflate(money, priceYear);
  if (!real.ok) return null;
  const converted = convert(real.money);
  return converted.ok ? converted.money : null;
}

export interface CostRow {
  metric: LotMetric;
  cost: ComparableCost;
  /** Comparable cost per kilometre, or null when not comparable. */
  perKm: number | null;
}

/** One row per lot that has any cost figure at all. */
export function lotCostRows(
  metrics: LotMetric[],
  options: CostOptions,
): CostRow[] {
  const rows: CostRow[] = [];
  for (const metric of metrics) {
    const best = bestCost(metric);
    if (!best) continue;
    const comparable = toComparable(best.money, options);
    rows.push({
      metric,
      cost: { basis: best.basis, recorded: best.money, comparable },
      perKm:
        comparable && metric.lengthKm > 0
          ? comparable.amount / metric.lengthKm
          : null,
    });
  }
  return rows;
}

export interface ProjectCostRow {
  projectId: string;
  projectName: LocalizedString;
  country: string;
  category: LotMetric["category"];
  /** Lots with a comparable cost, and lots in the project overall. */
  costedLots: number;
  totalLots: number;
  /** Length of the costed lots only, so perKm divides like with like. */
  costedKm: number;
  totalKm: number;
  /** Summed comparable cost, null when no lot could be restated. */
  total: Money | null;
  perKm: number | null;
  /** True when every lot in the project contributed a comparable figure. */
  complete: boolean;
}

/**
 * Aggregates lot costs up to whole projects.
 *
 * Only lots with a comparable figure are summed, and both the count and the
 * kilometres behind the sum are reported. A motorway with four of its nine
 * sections costed is a partial total, and the table has to be able to say
 * so — otherwise it reads as a complete price and ranks against projects
 * that are.
 */
export function projectCostRows(
  metrics: LotMetric[],
  options: CostOptions,
): ProjectCostRow[] {
  const byProject = new Map<string, LotMetric[]>();
  for (const metric of metrics) {
    const list = byProject.get(metric.projectId) ?? [];
    list.push(metric);
    byProject.set(metric.projectId, list);
  }

  const rows: ProjectCostRow[] = [];
  for (const [projectId, lots] of byProject) {
    let amount = 0;
    let costedKm = 0;
    let costedLots = 0;
    let currency: string | null = null;

    for (const lot of lots) {
      const best = bestCost(lot);
      if (!best) continue;
      const comparable = toComparable(best.money, options);
      if (!comparable) continue;
      amount += comparable.amount;
      costedKm += lot.lengthKm;
      costedLots++;
      currency = comparable.currency;
    }

    const first = lots[0];
    const total: Money | null =
      currency !== null
        ? { amount, currency, year: options.priceYear }
        : null;

    rows.push({
      projectId,
      projectName: first.projectName,
      country: first.country,
      category: first.category,
      costedLots,
      totalLots: lots.length,
      costedKm,
      totalKm: lots.reduce((sum, l) => sum + l.lengthKm, 0),
      total,
      perKm: total && costedKm > 0 ? total.amount / costedKm : null,
      complete: costedLots === lots.length,
    });
  }

  return rows;
}

/**
 * Lots that have opened, newest first. The base list for the slip table.
 *
 * Shared track is dropped: the table lists sections across every project, so
 * a tunnel two metro lines run through would appear twice as the same
 * physical stretch of railway.
 */
export function openedLots(metrics: LotMetric[]): LotMetric[] {
  return metrics
    .filter(
      (m) =>
        m.status === "opened" &&
        m.openedMonth !== null &&
        m.sharedWith === null,
    )
    .sort((a, b) => b.openedMonth! - a.openedMonth!);
}

/**
 * Descending order with unmeasured rows held at the end.
 *
 * This is the default order the tables are handed, and the order a third
 * click on a header restores. Nulls go last for the same reason they do in
 * table.ts: an unmeasured row is not a zero.
 */
export function orderDescNullsLast<T>(
  rows: T[],
  valueOf: (row: T) => number | null,
): T[] {
  const measured: T[] = [];
  const missing: T[] = [];
  for (const row of rows) {
    (valueOf(row) === null ? missing : measured).push(row);
  }
  measured.sort((a, b) => valueOf(b)! - valueOf(a)!);
  return [...measured, ...missing];
}

/**
 * Groups ordered worst median slip first.
 *
 * Unlike `sortGroups` in rankings.ts this keeps groups whose slip cannot be
 * measured, because the table also carries columns that can be (lots,
 * length) and dropping a firm entirely would hide work it actually did.
 * `minLots` still applies: one lot is an anecdote, not a track record.
 */
export function orderByMedianSlip(
  groups: GroupRanking[],
  minLots = 1,
): GroupRanking[] {
  return orderDescNullsLast(
    groups.filter((g) => g.lots >= minLots),
    (g) => g.slip.median,
  );
}
