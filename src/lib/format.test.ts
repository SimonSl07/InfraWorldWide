import { describe, it, expect } from "vitest";
import { formatMoney, formatDate } from "./format";

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
