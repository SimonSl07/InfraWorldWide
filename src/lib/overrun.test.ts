import { describe, it, expect } from "vitest";
import { computeOverrun, computeOverruns, isOverrun } from "./overrun";
import { createDeflator } from "./deflator";
import { createConverter } from "./fx";
import type { DeflatorTable, FxTable, Lot } from "./schema";

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
    expect(r.overrun.pct).toBeLessThan(r.overrun.nominalPct!);
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
    expect(r.overrun.baseline).toEqual({
      amount: 1000,
      currency: "EUR",
      year: 2013,
    });
    expect(r.overrun.actual).toEqual({
      amount: 1500,
      currency: "EUR",
      year: 2021,
    });
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
    expect(r.overrun.pct).toBeCloseTo(r.overrun.nominalPct!, 6);
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
        lot({
          cost: { estimated: { amount: 500, currency: "EUR", year: 2021 } },
        }),
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

  it("refuses a figure that may not enter a comparison", () => {
    // A programme figure covers the whole endeavour, so measuring a lot's
    // outturn against it would report an overrun of minus ninety percent.
    const r = computeOverrun(
      lot({
        cost: {
          estimated: {
            amount: 745,
            currency: "EUR",
            year: 2021,
            scope: "programme",
          },
          actual: { amount: 120, currency: "EUR", year: 2021 },
        },
      }),
      "estimate",
      opts,
    );
    expect(r).toEqual({
      ok: false,
      basis: "estimate",
      reason: "not_comparable",
    });
  });

  it("refuses a baseline recorded without a price year", () => {
    const r = computeOverrun(
      lot({
        cost: {
          estimated: { amount: 100, currency: "EUR" },
          actual: { amount: 120, currency: "EUR", year: 2021 },
        },
      }),
      "estimate",
      opts,
    );
    expect(r).toEqual({
      ok: false,
      basis: "estimate",
      reason: "not_comparable",
    });
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
    expect(isOverrun(both.estimate) && both.estimate.overrun.pct).toBeCloseTo(
      20,
      6,
    );
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

/**
 * Cross-currency comparison used to be refused outright, against a comment
 * saying the dataset carried no FX rates. It has carried them since fx.ts
 * landed, and performance.ts already does deflate-then-convert correctly.
 * Only three lots in the whole dataset record both an estimate and an
 * outturn, so refusing a currency change threw away rows the ranking needs.
 */
describe("computeOverrun — across currencies", () => {
  const fxTable: FxTable = {
    base: "EUR",
    note: "test",
    sources: [{ title: "t", url: "https://example.org" }],
    rates: {
      RON: {
        label: { en: "Romanian leu" },
        perEur: { "2013": 4.419, "2021": 4.9215, "2025": 5.0 },
      },
    },
  };
  const convert = createConverter(fxTable);

  const mixed = lot({
    cost: {
      estimated: { amount: 4419, currency: "RON", year: 2013 },
      actual: { amount: 1500, currency: "EUR", year: 2021 },
    },
  });

  it("still refuses when no converter is supplied", () => {
    // Back-compatible: a caller without FX rates gets the old behaviour.
    expect(computeOverrun(mixed, "estimate", opts)).toEqual({
      ok: false,
      basis: "estimate",
      reason: "currency_mismatch",
    });
  });

  it("compares them once a converter is supplied", () => {
    const result = computeOverrun(mixed, "estimate", { ...opts, convert });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overrun.baselineReal.currency).toBe("EUR");
    expect(result.overrun.actualReal.currency).toBe("EUR");
  });

  it("deflates within the currency before converting", () => {
    const result = computeOverrun(mixed, "estimate", { ...opts, convert });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 4419 RON @2013 deflated to 2025: 4419 * 160.06/99.04 = 7141.9 RON,
    // then converted at the 2025 rate of 5.0 = 1428.4 EUR. Converting first
    // would have used the 2013 rate and produced a different, meaningless
    // number.
    expect(result.overrun.baselineReal.amount).toBeCloseTo(1428.4, 0);
  });

  it("refuses when a currency is restatable but has no published rate", () => {
    // BGN can be deflated here but the FX table holds no series for it, so
    // the refusal has to come from the conversion step, not the deflator.
    const withBgn = createDeflator({
      ...table,
      series: {
        ...table.series,
        BGN: {
          geo: "BG",
          label: { en: "Bulgaria" },
          index: { "2013": 99.0, "2021": 110.0, "2025": 150.0 },
        },
      },
    });
    const unknown = lot({
      cost: {
        estimated: { amount: 100, currency: "BGN", year: 2013 },
        actual: { amount: 150, currency: "EUR", year: 2021 },
      },
    });
    expect(
      computeOverrun(unknown, "estimate", {
        deflate: withBgn,
        priceYear: 2025,
        convert,
      }),
    ).toEqual({
      ok: false,
      basis: "estimate",
      reason: "not_convertible",
    });
  });

  it("leaves the recorded figures in their own currencies", () => {
    const result = computeOverrun(mixed, "estimate", { ...opts, convert });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overrun.baseline.currency).toBe("RON");
    expect(result.overrun.actual.currency).toBe("EUR");
  });

  it("reports no nominal figure across currencies", () => {
    // A nominal percentage between two currencies is not a number that
    // means anything, so it is withheld rather than invented.
    const result = computeOverrun(mixed, "estimate", { ...opts, convert });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overrun.nominalPct).toBeNull();
  });

  it("still reports a nominal figure within one currency", () => {
    const sameCurrency = lot({
      cost: {
        estimated: { amount: 1000, currency: "EUR", year: 2013 },
        actual: { amount: 1500, currency: "EUR", year: 2021 },
      },
    });
    const result = computeOverrun(sameCurrency, "estimate", {
      ...opts,
      convert,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overrun.nominalPct).toBeCloseTo(50, 5);
  });
});
