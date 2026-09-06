import { describe, it, expect } from "vitest";
import { createAnalysisContext } from "./analysis-context";
import type { ContractorRegistry, DeflatorTable, FxTable } from "./schema";

/**
 * EUR runs to 2022 and RON stops at 2020: the common year is the earlier
 * stop, not the base year and not the longest series.
 */
const deflators: DeflatorTable = {
  baseYear: 2015,
  note: "test",
  sources: [{ title: "t", url: "https://example.org" }],
  series: {
    EUR: {
      geo: "EA",
      label: { en: "Euro area" },
      index: { "2015": 100, "2020": 110, "2022": 120 },
    },
    RON: {
      geo: "RO",
      label: { en: "Romania" },
      index: { "2015": 100, "2020": 115 },
    },
  },
};

const fx: FxTable = {
  base: "EUR",
  note: "test",
  sources: [{ title: "t", url: "https://example.org" }],
  rates: {
    RON: {
      label: { en: "Romanian leu" },
      perEur: { "2015": 4.45, "2020": 4.84 },
    },
  },
};

const contractors: ContractorRegistry = { note: "test", contractors: [] };

const NOW = 2026 * 12;

function context(table: DeflatorTable = deflators) {
  return createAnalysisContext({
    deflators: table,
    fx,
    contractors,
    nowMonth: NOW,
  });
}

describe("createAnalysisContext", () => {
  it("picks the newest price year every series covers", () => {
    expect(context().priceYear).toBe(2020);
  });

  it("falls back to the base year when no series covers any year", () => {
    expect(context({ ...deflators, series: {} }).priceYear).toBe(2015);
  });

  it("converts into the fx base at the figure's own year", () => {
    const result = context().convert({
      amount: 484,
      currency: "RON",
      year: 2020,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.money.currency).toBe("EUR");
    expect(result.money.year).toBe(2020);
    expect(result.money.amount).toBeCloseTo(100, 9);
  });

  it("hands collectLotMetrics a converter and the month it was asked for", () => {
    const { metricsOptions } = context();
    expect(metricsOptions.convert).toBeDefined();
    expect(metricsOptions.nowMonth).toBe(NOW);
  });

  /**
   * The cost tables and the lot metrics must be on one basis, and by
   * reference rather than by equal-looking copies: a second deflator built
   * from the same table would pass a deep equality check and still be a
   * second place for the two to drift apart.
   */
  it("gives the cost tables and the metrics the same basis", () => {
    const ctx = context();
    expect(ctx.costOptions.deflate).toBe(ctx.deflate);
    expect(ctx.costOptions.convert).toBe(ctx.convert);
    expect(ctx.costOptions.priceYear).toBe(ctx.priceYear);
    expect(ctx.metricsOptions.deflate).toBe(ctx.deflate);
    expect(ctx.metricsOptions.convert).toBe(ctx.convert);
    expect(ctx.metricsOptions.priceYear).toBe(ctx.priceYear);
    expect(ctx.metricsOptions.resolve).toBe(ctx.resolve);
  });
});
