import { describe, it, expect } from "vitest";
import {
  formatKm,
  formatMoney,
  formatDate,
  formatMonth,
  formatMonths,
  formatPercent,
} from "./format";
import { monthIndex } from "./contract";

describe("formatMoney", () => {
  it("formats millions with currency symbols", () => {
    expect(formatMoney({ amount: 500, currency: "EUR", year: 2012 })).toBe("€500M");
    expect(formatMoney({ amount: 42, currency: "USD", year: 2020 })).toBe("$42M");
  });
  it("rolls up to billions", () => {
    expect(formatMoney({ amount: 1800, currency: "EUR", year: 2023 })).toBe("€1.8B");
    expect(formatMoney({ amount: 2000, currency: "EUR", year: 2023 })).toBe("€2B");
  });
  it("falls back to the currency code for unknown currencies", () => {
    expect(formatMoney({ amount: 10, currency: "CHF", year: 2020 })).toBe("CHF 10M");
  });
});

describe("formatDate", () => {
  it("keeps year-only dates as years", () => {
    expect(formatDate("2012", "en")).toBe("2012");
  });
  it("formats year-month dates", () => {
    expect(formatDate("2012-07", "en")).toBe("Jul 2012");
  });
  it("formats full dates", () => {
    expect(formatDate("2012-07-19", "en")).toBe("Jul 19, 2012");
  });
});

describe("formatMonth", () => {
  it("renders an absolute month index", () => {
    expect(formatMonth(monthIndex("2021-01")!, "en")).toBe("Jan 2021");
    expect(formatMonth(monthIndex("2026-08")!, "en")).toBe("Aug 2026");
  });
  it("round-trips a year-only date to January", () => {
    expect(formatMonth(monthIndex("1999")!, "en")).toBe("Jan 1999");
  });
});

describe("formatKm", () => {
  it("rounds to whole kilometres and groups thousands", () => {
    expect(formatKm(1141.6, "en")).toBe("1,142 km");
    expect(formatKm(1.92, "en")).toBe("2 km");
  });

  /** A 360 m bridge is a real row in the tables; "0 km" would be a lie. */
  it("keeps a decimal below one kilometre", () => {
    expect(formatKm(0.36, "en")).toBe("0.4 km");
    expect(formatKm(0.94, "en")).toBe("0.9 km");
    expect(formatKm(0, "en")).toBe("0 km");
  });

  it("groups by locale", () => {
    expect(formatKm(1142, "ro")).toBe("1.142 km");
  });
});

describe("formatPercent", () => {
  it("signs overruns and underruns", () => {
    expect(formatPercent(38.309)).toBe("+38.3%");
    expect(formatPercent(-10)).toBe("−10.0%");
  });
  it("leaves zero unsigned", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });
});

describe("formatMonths", () => {
  it("signs slips", () => {
    expect(formatMonths(46)).toBe("+46 mo");
    expect(formatMonths(-4)).toBe("−4 mo");
  });
  it("leaves zero unsigned", () => {
    expect(formatMonths(0)).toBe("0 mo");
  });
  it("takes a localized unit", () => {
    expect(formatMonths(46, "luni")).toBe("+46 luni");
    expect(formatMonths(-4, "luni")).toBe("−4 luni");
  });
});
