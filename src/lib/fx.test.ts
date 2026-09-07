import { describe, it, expect } from "vitest";
import { createConverter } from "./fx";
import type { FxTable, Money } from "./schema";

const table: FxTable = {
  base: "EUR",
  note: "test",
  sources: [{ title: "test", url: "https://example.org" }],
  rates: {
    RON: {
      label: { en: "Romanian leu" },
      perEur: { "2015": 4.4454, "2023": 4.9467 },
    },
    BGN: {
      label: { en: "Bulgarian lev" },
      perEur: { "2015": 1.9558, "2023": 1.9558 },
    },
  },
};

const money = (amount: number, currency: string, year: number): Money => ({
  amount,
  currency,
  year,
});

describe("createConverter", () => {
  const convert = createConverter(table);

  it("passes euro amounts through untouched", () => {
    const eur = money(500, "EUR", 2023);
    const result = convert(eur);
    expect(result).toEqual({ ok: true, money: eur });
  });

  it("divides by the rate for the amount's own price year", () => {
    const result = convert(money(4946.7, "RON", 2023));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.money.amount).toBeCloseTo(1000, 3);
    expect(result.money.currency).toBe("EUR");
  });

  it("uses each year's own rate rather than one fixed rate", () => {
    const a = convert(money(1000, "RON", 2015));
    const b = convert(money(1000, "RON", 2023));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // 2015 lei buy more euro than 2023 lei, because the leu weakened.
    expect(a.money.amount).toBeGreaterThan(b.money.amount);
  });

  it("keeps the price year, since only the currency changed", () => {
    const result = convert(money(100, "RON", 2015));
    expect(result.ok && result.money.year).toBe(2015);
  });

  it("refuses a currency it holds no rates for", () => {
    expect(convert(money(100, "HUF", 2023))).toEqual({
      ok: false,
      reason: "unknown_currency",
    });
  });

  it("refuses a figure that carries no price year", () => {
    // There is no "the rate" for a figure with no year, and the euro leg
    // must not pass one through untouched either.
    expect(convert({ amount: 100, currency: "RON" })).toEqual({
      ok: false,
      reason: "missing_price_year",
    });
  });

  it("refuses a year outside the series rather than guessing", () => {
    expect(convert(money(100, "RON", 1994))).toEqual({
      ok: false,
      reason: "year_out_of_range",
    });
  });
});
