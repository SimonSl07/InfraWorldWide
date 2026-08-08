import type { DeflatorTable, Money } from "./schema";

/**
 * Restating costs in comparable prices.
 *
 * A cost figure is only meaningful together with its price year: €1.2B of
 * 2013 money and €1.2B of 2023 money are not the same commitment. Every
 * comparison in overrun.ts therefore runs both figures through a Deflator
 * first, and reports the result as "real" alongside the nominal one.
 */

/** Why a value could not be expressed in target-year prices. */
export type DeflateFailure = "unknown_currency" | "year_out_of_range";

export type DeflateResult =
  | { ok: true; money: Money }
  | { ok: false; reason: DeflateFailure };

/**
 * Restates a Money value in `targetYear` prices, keeping its currency.
 *
 * This is the pluggable seam: the shipped implementation is backed by
 * consumer price indices (data/deflators.json), but any function with this
 * signature — a construction cost index, a country-specific deflator —
 * can be substituted without changing a single caller.
 */
export type Deflator = (money: Money, targetYear: number) => DeflateResult;

/** Builds a Deflator from an index table keyed by currency. */
export function createDeflator(table: DeflatorTable): Deflator {
  return (money, targetYear) => {
    const series = table.series[money.currency];
    if (!series) return { ok: false, reason: "unknown_currency" };

    const from = series.index[String(money.year)];
    const to = series.index[String(targetYear)];
    if (from === undefined || to === undefined) {
      return { ok: false, reason: "year_out_of_range" };
    }

    return {
      ok: true,
      money: {
        amount: (money.amount * to) / from,
        currency: money.currency,
        year: targetYear,
      },
    };
  };
}

/** A Deflator that always fails — for callers that want nominal figures only. */
export const nominalDeflator: Deflator = () => ({
  ok: false,
  reason: "year_out_of_range",
});

/** Latest year present in a currency's series, or null if it has none. */
export function latestYear(
  table: DeflatorTable,
  currency: string,
): number | null {
  const series = table.series[currency];
  if (!series) return null;
  const years = Object.keys(series.index).map(Number);
  return years.length > 0 ? Math.max(...years) : null;
}

/**
 * Latest year covered by *every* series in the table — the newest price year
 * that all currencies can be restated into, so figures across countries stay
 * mutually comparable. Null when the table is empty.
 */
export function commonLatestYear(table: DeflatorTable): number | null {
  const perCurrency = Object.keys(table.series)
    .map((c) => latestYear(table, c))
    .filter((y): y is number => y !== null);
  return perCurrency.length > 0 ? Math.min(...perCurrency) : null;
}
