import { describe, it, expect } from "vitest";
import { createDeflator, commonLatestYear, latestYear } from "./deflator";
import type { DeflatorTable } from "./schema";

const table: DeflatorTable = {
  baseYear: 2015,
  note: "test",
  sources: [{ title: "t", url: "https://example.org" }],
  series: {
    EUR: {
      geo: "EA",
      label: { en: "Euro area" },
      index: { "2013": 99.38, "2015": 100, "2021": 107.78, "2025": 128.75 },
    },
    RON: {
      geo: "RO",
      label: { en: "Romania" },
      index: { "2013": 99.04, "2015": 100, "2021": 115.21 },
    },
  },
};

const deflate = createDeflator(table);

describe("createDeflator", () => {
  it("restates a value forward into later prices", () => {
    const r = deflate({ amount: 1000, currency: "EUR", year: 2013 }, 2025);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 1000 × 128.75 / 99.38
    expect(r.money.amount).toBeCloseTo(1295.53, 2);
    expect(r.money.currency).toBe("EUR");
    expect(r.money.year).toBe(2025);
  });

  it("restates a value backward into earlier prices", () => {
    const r = deflate({ amount: 1295.53, currency: "EUR", year: 2025 }, 2013);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.money.amount).toBeCloseTo(1000, 2);
  });

  it("is a no-op when the target year is the value's own price year", () => {
    const r = deflate({ amount: 500, currency: "RON", year: 2021 }, 2021);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.money.amount).toBeCloseTo(500, 10);
  });

  it("uses each currency's own series", () => {
    // RON inflated far more than EUR over 2013→2021.
    const eur = deflate({ amount: 100, currency: "EUR", year: 2013 }, 2021);
    const ron = deflate({ amount: 100, currency: "RON", year: 2013 }, 2021);
    expect(eur.ok && ron.ok).toBe(true);
    if (!eur.ok || !ron.ok) return;
    expect(ron.money.amount).toBeGreaterThan(eur.money.amount);
  });

  it("reports an unknown currency rather than guessing", () => {
    const r = deflate({ amount: 10, currency: "USD", year: 2015 }, 2021);
    expect(r).toEqual({ ok: false, reason: "unknown_currency" });
  });

  it("reports a missing price year for what it is", () => {
    // A figure whose source never stated a price year used to fail as
    // "year_out_of_range" via a lookup for the string "undefined", which
    // reads as a gap in the index rather than a gap in the data.
    const r = deflate({ amount: 100, currency: "EUR" }, 2025);
    expect(r).toEqual({ ok: false, reason: "missing_price_year" });
  });

  it("reports a year outside the series rather than extrapolating", () => {
    expect(deflate({ amount: 10, currency: "EUR", year: 1980 }, 2021)).toEqual({
      ok: false,
      reason: "year_out_of_range",
    });
    expect(deflate({ amount: 10, currency: "RON", year: 2013 }, 2025)).toEqual({
      ok: false,
      reason: "year_out_of_range",
    });
  });

  it("round-trips through an intermediate year", () => {
    const mid = deflate({ amount: 750, currency: "EUR", year: 2013 }, 2021);
    expect(mid.ok).toBe(true);
    if (!mid.ok) return;
    const back = deflate(mid.money, 2013);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.money.amount).toBeCloseTo(750, 8);
  });
});

describe("latestYear / commonLatestYear", () => {
  it("returns the newest year of one series", () => {
    expect(latestYear(table, "EUR")).toBe(2025);
    expect(latestYear(table, "RON")).toBe(2021);
  });

  it("returns null for a currency with no series", () => {
    expect(latestYear(table, "GBP")).toBeNull();
  });

  it("takes the newest year every series covers", () => {
    expect(commonLatestYear(table)).toBe(2021);
  });

  it("returns null for an empty table", () => {
    expect(commonLatestYear({ ...table, series: {} })).toBeNull();
  });
});
