import { describe, it, expect } from "vitest";
import { computeOverrun, computeOverruns, isOverrun } from "./overrun";
import { createDeflator } from "./deflator";
import type { DeflatorTable, Lot } from "./schema";

const table: DeflatorTable = {
  baseYear: 2015,
  note: "test",
  sources: [{ title: "t", url: "https://example.org" }],
  series: {
    EUR: {
      geo: "EA",
      label: { en: "Euro area" },
      index: { "2013": 99.38, "2021": 107.78, "2025": 128.75 },
    },
    RON: {
      geo: "RO",
      label: { en: "Romania" },
      index: { "2013": 99.04, "2021": 115.21, "2025": 160.06 },
    },
  },
};

const opts = { deflate: createDeflator(table), priceYear: 2025 };

function lot(overrides: Partial<Lot>): Lot {
  return {
    id: "l1",
    name: { en: "Lot 1" },
    status: "opened",
    dates: { opened: "2021" },
    lengthKm: 10,
    geometryRef: "l1",
    ...overrides,
  } as Lot;
}

describe("computeOverrun — estimate basis", () => {
  const overspent = lot({
    cost: {
      estimated: { amount: 1000, currency: "EUR", year: 2013 },
      actual: { amount: 1500, currency: "EUR", year: 2021 },
    },
  });

  it("separates the real overrun from the inflation in it", () => {
    const r = computeOverrun(overspent, "estimate", opts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 50% more money, but the estimate was in cheaper 2013 euros — only
    // 38.3% of the gap is a real increase.
    expect(r.overrun.nominalPct).toBeCloseTo(50, 6);
    expect(r.overrun.pct).toBeCloseTo(38.31, 1);
    expect(r.overrun.pct).toBeLessThan(r.overrun.nominalPct);
  });

  it("restates both figures into the target price year", () => {
    const r = computeOverrun(overspent, "estimate", opts);
    if (!r.ok) throw new Error("expected ok");
    expect(r.overrun.priceYear).toBe(2025);
    expect(r.overrun.baselineReal.year).toBe(2025);
    expect(r.overrun.actualReal.year).toBe(2025);
    expect(r.overrun.baselineReal.amount).toBeCloseTo(1295.53, 2);
    expect(r.overrun.actualReal.amount).toBeCloseTo(1791.84, 2);
    expect(r.overrun.ratio).toBeCloseTo(1.3831, 3);
  });

  it("keeps the figures as recorded alongside the restated ones", () => {
    const r = computeOverrun(overspent, "estimate", opts);
    if (!r.ok) throw new Error("expected ok");
    expect(r.overrun.baseline).toEqual({ amount: 1000, currency: "EUR", year: 2013 });
    expect(r.overrun.actual).toEqual({ amount: 1500, currency: "EUR", year: 2021 });
  });

  it("flags when no restatement was needed", () => {
    const same = lot({
      cost: {
        estimated: { amount: 1000, currency: "EUR", year: 2021 },
        actual: { amount: 1200, currency: "EUR", year: 2021 },
      },
    });
    const r = computeOverrun(same, "estimate", opts);
    if (!r.ok) throw new Error("expected ok");
    expect(r.overrun.samePriceYear).toBe(true);
    expect(r.overrun.pct).toBeCloseTo(20, 6);
    expect(r.overrun.pct).toBeCloseTo(r.overrun.nominalPct, 6);
  });

  it("reports coming in under budget as a negative percentage", () => {
    const under = lot({
      cost: {
        estimated: { amount: 1000, currency: "EUR", year: 2021 },
        actual: { amount: 900, currency: "EUR", year: 2021 },
      },
    });
    const r = computeOverrun(under, "estimate", opts);
    if (!r.ok) throw new Error("expected ok");
    expect(r.overrun.pct).toBeCloseTo(-10, 6);
  });

  it("can turn a nominal overrun into a real underrun", () => {
    // 10% more cash, but eight years of Romanian inflation in between.
    const r = computeOverrun(
      lot({
        cost: {
          estimated: { amount: 1000, currency: "RON", year: 2013 },
          actual: { amount: 1100, currency: "RON", year: 2021 },
        },
      }),
      "estimate",
      opts,
    );
    if (!r.ok) throw new Error("expected ok");
    expect(r.overrun.nominalPct).toBeCloseTo(10, 6);
    expect(r.overrun.pct).toBeLessThan(0);
  });
});

describe("computeOverrun — award basis", () => {
  it("measures the actual against the signed contract value", () => {
    const r = computeOverrun(
      lot({
        contract: { value: { amount: 500, currency: "EUR", year: 2021 } },
        cost: { actual: { amount: 750, currency: "EUR", year: 2021 } },
      }),
      "award",
      opts,
    );
    if (!r.ok) throw new Error("expected ok");
    expect(r.overrun.basis).toBe("award");
    expect(r.overrun.pct).toBeCloseTo(50, 6);
  });

  it("ignores cost.estimated entirely", () => {
    const r = computeOverrun(
      lot({
        contract: { value: { amount: 500, currency: "EUR", year: 2021 } },
        cost: {
          estimated: { amount: 900, currency: "EUR", year: 2021 },
          actual: { amount: 750, currency: "EUR", year: 2021 },
        },
      }),
      "award",
      opts,
    );
    if (!r.ok) throw new Error("expected ok");
    expect(r.overrun.baseline.amount).toBe(500);
  });
});

describe("computeOverrun — refusals", () => {
  it("refuses without a baseline", () => {
    expect(
      computeOverrun(
        lot({ cost: { actual: { amount: 750, currency: "EUR", year: 2021 } } }),
        "estimate",
        opts,
      ),
    ).toEqual({ ok: false, basis: "estimate", reason: "missing_baseline" });
  });

  it("refuses without an actual", () => {
    expect(
      computeOverrun(
        lot({ cost: { estimated: { amount: 500, currency: "EUR", year: 2021 } } }),
        "estimate",
        opts,
      ),
    ).toEqual({ ok: false, basis: "estimate", reason: "missing_actual" });
  });

  it("refuses to compare across currencies rather than inventing an FX rate", () => {
    expect(
      computeOverrun(
        lot({
          cost: {
            estimated: { amount: 500, currency: "EUR", year: 2021 },
            actual: { amount: 2500, currency: "RON", year: 2021 },
          },
        }),
        "estimate",
        opts,
      ),
    ).toEqual({ ok: false, basis: "estimate", reason: "currency_mismatch" });
  });

  it("refuses when a price year is outside the index", () => {
    expect(
      computeOverrun(
        lot({
          cost: {
            estimated: { amount: 500, currency: "EUR", year: 1990 },
            actual: { amount: 750, currency: "EUR", year: 2021 },
          },
        }),
        "estimate",
        opts,
      ),
    ).toEqual({ ok: false, basis: "estimate", reason: "not_deflatable" });
  });

  it("refuses an unknown currency", () => {
    expect(
      computeOverrun(
        lot({
          cost: {
            estimated: { amount: 500, currency: "USD", year: 2021 },
            actual: { amount: 750, currency: "USD", year: 2021 },
          },
        }),
        "estimate",
        opts,
      ).ok,
    ).toBe(false);
  });
});

describe("computeOverruns", () => {
  it("reports both bases independently", () => {
    const both = computeOverruns(
      lot({
        contract: { value: { amount: 800, currency: "EUR", year: 2021 } },
        cost: {
          estimated: { amount: 1000, currency: "EUR", year: 2021 },
          actual: { amount: 1200, currency: "EUR", year: 2021 },
        },
      }),
      opts,
    );
    expect(isOverrun(both.estimate) && both.estimate.overrun.pct).toBeCloseTo(20, 6);
    expect(isOverrun(both.award) && both.award.overrun.pct).toBeCloseTo(50, 6);
  });

  it("can succeed on one basis and fail on the other", () => {
    const both = computeOverruns(
      lot({
        cost: {
          estimated: { amount: 1000, currency: "EUR", year: 2021 },
          actual: { amount: 1200, currency: "EUR", year: 2021 },
        },
      }),
      opts,
    );
    expect(both.estimate.ok).toBe(true);
    expect(both.award).toEqual({
      ok: false,
      basis: "award",
      reason: "missing_baseline",
    });
  });
});
