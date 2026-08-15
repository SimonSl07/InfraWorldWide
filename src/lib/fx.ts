import type { FxTable, Money } from "./schema";

/**
 * Converting costs into one currency so they can be ranked against each
 * other.
 *
 * This is the second half of a two-step move that must happen in this order:
 *
 *   1. deflate within the currency, to a common price year (deflator.ts)
 *   2. convert at that year's exchange rate (here)
 *
 * Doing it the other way round converts at a rate that belongs to a
 * different year than the prices do, which quietly mixes inflation and
 * currency movement into one unattributable number.
 *
 * Like the deflator, this refuses rather than approximates: a year outside
 * the published series yields a failure, and the caller drops the row from
 * the ranking instead of guessing a rate.
 */

export type ConvertFailure =
  | "unknown_currency"
  | "year_out_of_range"
  /** No price year, so there is no year whose rate could apply. */
  | "missing_price_year";

export type ConvertResult =
  | { ok: true; money: Money }
  | { ok: false; reason: ConvertFailure };

export type Converter = (money: Money) => ConvertResult;

/**
 * Builds a converter to the table's base currency, using the rate for each
 * amount's own price year.
 */
export function createConverter(table: FxTable): Converter {
  return (money) => {
    // Before the base-currency shortcut: a figure with no price year cannot
    // be put on the common axis whatever currency it is in, and letting the
    // euro leg through would make that depend on which currency it happened
    // to be recorded in.
    if (money.year === undefined) {
      return { ok: false, reason: "missing_price_year" };
    }

    // Already in the base currency: nothing to convert, and demanding a
    // self-rate would fail every euro cost in the dataset.
    if (money.currency === table.base) return { ok: true, money };

    const series = table.rates[money.currency];
    if (!series) return { ok: false, reason: "unknown_currency" };

    const rate = series.perEur[String(money.year)];
    if (rate === undefined) return { ok: false, reason: "year_out_of_range" };

    return {
      ok: true,
      money: {
        amount: money.amount / rate,
        currency: table.base,
        year: money.year,
      },
    };
  };
}

/** A converter that only passes base-currency amounts through. */
export function baseOnlyConverter(base: string): Converter {
  return (money) =>
    money.currency === base
      ? { ok: true, money }
      : { ok: false, reason: "unknown_currency" };
}

/** Years a currency can be converted for, ascending. Empty when unknown. */
export function coveredYears(table: FxTable, currency: string): number[] {
  const series = table.rates[currency];
  if (!series) return [];
  return Object.keys(series.perEur)
    .map(Number)
    .sort((a, b) => a - b);
}
