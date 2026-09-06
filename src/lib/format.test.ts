import { describe, it, expect } from "vitest";
import {
  formatKm,
  formatMoney,
  formatDate,
  formatMonth,
  formatMonths,
  formatNumber,
  formatPercent,
} from "./format";
import { monthIndex } from "./contract";

describe("formatMoney", () => {
  it("formats millions with currency symbols", () => {
    expect(
      formatMoney({ amount: 500, currency: "EUR", year: 2012 }, "en"),
    ).toBe("€500M");
    expect(formatMoney({ amount: 42, currency: "USD", year: 2020 }, "en")).toBe(
      "$42M",
    );
  });
  it("rolls up to billions", () => {
    expect(
      formatMoney({ amount: 1800, currency: "EUR", year: 2023 }, "en"),
    ).toBe("€1.8B");
    expect(
      formatMoney({ amount: 2000, currency: "EUR", year: 2023 }, "en"),
    ).toBe("€2B");
  });
  it("falls back to the currency code for unknown currencies", () => {
    expect(formatMoney({ amount: 10, currency: "CHF", year: 2020 }, "en")).toBe(
      "CHF 10M",
    );
  });

  /**
   * A sourced figure is shown as recorded. A fixed one decimal turned 26
   * committed amounts into numbers no source states: lot 5 of bg-a1-trakia
   * was awarded at 133.97M BGN and read as "лв134.0M", which is a rounder
   * claim than the award notice makes.
   */
  it("keeps the decimals the figure was recorded with", () => {
    const bgn = (amount: number) =>
      formatMoney({ amount, currency: "BGN", year: 2015 }, "en");
    expect(bgn(133.97)).toBe("лв133.97M");
    expect(bgn(137.868)).toBe("лв137.868M");
    expect(bgn(198.16)).toBe("лв198.16M");
    // An amount that really is whole gains no decimal point.
    expect(bgn(200)).toBe("лв200M");
  });

  it("does not print float noise as precision", () => {
    // 1.7 the long way round. Three decimals is the cap, so an amount that
    // needs more is rounded rather than spilling sixteen digits.
    expect(
      formatMoney({ amount: 0.8 + 0.9, currency: "EUR", year: 2020 }, "en"),
    ).toBe("€1.7M");
    expect(
      formatMoney({ amount: 12.34567, currency: "EUR", year: 2020 }, "en"),
    ).toBe("€12.346M");
  });

  it("separates the recorded decimals the way the locale does", () => {
    expect(
      formatMoney({ amount: 133.97, currency: "BGN", year: 2015 }, "ro"),
    ).toBe("лв133,97 mil.");
  });

  /** Nine cost figures in the dataset are in BGN. */
  it("knows the currencies the dataset actually uses", () => {
    expect(
      formatMoney({ amount: 500, currency: "BGN", year: 2020 }, "en"),
    ).toBe("лв500M");
    expect(formatMoney({ amount: 90, currency: "RSD", year: 2020 }, "en")).toBe(
      "дин.90M",
    );
  });

  it("uses the locale's decimal separator and magnitude words", () => {
    expect(
      formatMoney({ amount: 1800, currency: "EUR", year: 2023 }, "ro"),
    ).toBe("€1,8 mld.");
    expect(
      formatMoney({ amount: 500, currency: "RON", year: 2012 }, "ro"),
    ).toBe("lei 500 mil.");
  });

  it("groups thousands of millions by locale", () => {
    expect(
      formatMoney({ amount: 4870, currency: "RON", year: 2026 }, "en"),
    ).toBe("lei 4.9B");
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
    expect(formatPercent(38.309, "en")).toBe("+38.3%");
    expect(formatPercent(-10, "en")).toBe("−10.0%");
  });
  it("leaves zero unsigned", () => {
    expect(formatPercent(0, "en")).toBe("0.0%");
  });

  /** Romanian writes 38,3 and not 38.3, so toFixed() was wrong for /ro. */
  it("uses the locale's decimal separator", () => {
    expect(formatPercent(38.309, "ro")).toBe("+38,3%");
    expect(formatPercent(-10, "ro")).toBe("−10,0%");
  });
});

describe("formatMonths", () => {
  it("signs slips", () => {
    expect(formatMonths(46, "mo", "en")).toBe("+46 mo");
    expect(formatMonths(-4, "mo", "en")).toBe("−4 mo");
  });
  it("leaves zero unsigned", () => {
    expect(formatMonths(0, "mo", "en")).toBe("0 mo");
  });
  it("takes a localized unit", () => {
    expect(formatMonths(46, "luni", "en")).toBe("+46 luni");
    expect(formatMonths(-4, "luni", "en")).toBe("−4 luni");
  });

  it("groups large month counts by locale", () => {
    expect(formatMonths(1200, "mo", "en")).toBe("+1,200 mo");
    expect(formatMonths(1200, "luni", "ro")).toBe("+1.200 luni");
  });
});

describe("formatNumber", () => {
  it("groups by locale", () => {
    expect(formatNumber(1234567, "en")).toBe("1,234,567");
    expect(formatNumber(1234567, "ro")).toBe("1.234.567");
  });

  it("takes a fraction-digit count", () => {
    expect(formatNumber(12.345, "en", 1)).toBe("12.3");
    expect(formatNumber(12.345, "ro", 1)).toBe("12,3");
  });
});
