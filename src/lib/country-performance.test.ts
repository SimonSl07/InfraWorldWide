import { describe, it, expect } from "vitest";
import {
  countryPerformance,
  findCountryPerformance,
} from "./country-performance";
import { collectLotMetrics } from "./rankings";
import { createContractorResolver } from "./contractors";
import { createDeflator } from "./deflator";
import { createConverter } from "./fx";
import { monthIndex } from "./contract";
import type {
  ContractorRegistry,
  DeflatorTable,
  FxTable,
  Project,
} from "./schema";

const deflators: DeflatorTable = {
  baseYear: 2015,
  note: "test",
  sources: [{ title: "t", url: "https://example.org" }],
  series: {
    EUR: {
      geo: "EA",
      label: { en: "Euro area" },
      index: { "2015": 100, "2021": 100 },
    },
    RON: {
      geo: "RO",
      label: { en: "Romania" },
      index: { "2015": 100, "2021": 100 },
    },
  },
};

const fx: FxTable = {
  base: "EUR",
  note: "test",
  sources: [{ title: "t", url: "https://example.org" }],
  rates: { RON: { label: { en: "Leu" }, perEur: { "2021": 5 } } },
};

const registry: ContractorRegistry = { note: "test", contractors: [] };

/**
 * ro: one 20 km lot delivered 12 months late for €100M, one 10 km lot
 *     delivered on the contract date with no cost, and a 10 km shared lot
 *     that both must be kept out of.
 * bg: one 25 km lot delivered 2 months early for 500M RON (= €100M in 2021).
 */
const projects: Project[] = [
  {
    id: "ro-m1",
    country: "ro",
    category: "railway",
    name: { en: "M1" },
    description: { en: "" },
    sources: [{ title: "s", url: "https://example.org" }],
    lots: [
      {
        id: "late",
        name: { en: "Late" },
        status: "opened",
        lengthKm: 20,
        geometryRef: "late",
        dates: { constructionStart: "2018-01", opened: "2021-01" },
        contract: { executionMonths: 24 },
        cost: {
          estimated: { amount: 80, currency: "EUR", year: 2021 },
          actual: { amount: 100, currency: "EUR", year: 2021 },
        },
      },
      {
        id: "ontime",
        name: { en: "On time" },
        status: "opened",
        lengthKm: 10,
        geometryRef: "ontime",
        dates: { constructionStart: "2019-01", opened: "2021-01" },
        contract: { executionMonths: 24 },
      },
    ],
  },
  {
    id: "ro-m3",
    country: "ro",
    category: "railway",
    name: { en: "M3" },
    description: { en: "" },
    sources: [{ title: "s", url: "https://example.org" }],
    lots: [
      {
        id: "borrowed",
        name: { en: "Borrowed" },
        status: "opened",
        lengthKm: 10,
        geometryRef: "borrowed",
        sharedWith: "ro-m1",
        dates: { constructionStart: "2010-01", opened: "2020-01" },
        contract: { executionMonths: 12 },
        cost: { actual: { amount: 900, currency: "EUR", year: 2021 } },
      },
    ],
  },
  {
    id: "bg-m2",
    country: "bg",
    category: "railway",
    name: { en: "M2" },
    description: { en: "" },
    sources: [{ title: "s", url: "https://example.org" }],
    lots: [
      {
        id: "early",
        name: { en: "Early" },
        status: "opened",
        lengthKm: 25,
        geometryRef: "early",
        dates: { constructionStart: "2019-01", opened: "2020-11" },
        contract: { executionMonths: 24 },
        cost: { actual: { amount: 500, currency: "RON", year: 2021 } },
      },
    ],
  },
];

const metrics = collectLotMetrics(projects, {
  deflate: createDeflator(deflators),
  priceYear: 2021,
  resolve: createContractorResolver(registry),
  nowMonth: monthIndex("2026-08")!,
});

const rows = countryPerformance(metrics, {
  deflate: createDeflator(deflators),
  convert: createConverter(fx),
  priceYear: 2021,
});

describe("countryPerformance", () => {
  it("returns one row per country, ordered by code", () => {
    expect(rows.map((r) => r.code)).toEqual(["bg", "ro"]);
  });

  it("reports median slip and the sample behind it", () => {
    const ro = findCountryPerformance(rows, "ro")!;
    expect(ro.medianSlip).toBe(6); // +12 and 0
    expect(ro.slipN).toBe(2);
    expect(findCountryPerformance(rows, "bg")!.medianSlip).toBe(-2);
  });

  it("reports the share of delivered lots that met the contract date", () => {
    expect(findCountryPerformance(rows, "ro")!.onTimeShare).toBe(0.5);
    expect(findCountryPerformance(rows, "bg")!.onTimeShare).toBe(1);
  });

  it("reports median overrun against the estimate", () => {
    const ro = findCountryPerformance(rows, "ro")!;
    expect(ro.medianOverrun).toBeCloseTo(25, 6);
    expect(ro.overrunN).toBe(1);
    // Nothing in bg records both an estimate and an outturn.
    expect(findCountryPerformance(rows, "bg")!.medianOverrun).toBeNull();
    expect(findCountryPerformance(rows, "bg")!.overrunN).toBe(0);
  });

  it("converts costs to the base currency before dividing by length", () => {
    const bg = findCountryPerformance(rows, "bg")!;
    // 500M RON at 5 RON/EUR is €100M over 25 km.
    expect(bg.costPerKm).toBeCloseTo(4, 6);
    expect(bg.costCurrency).toBe("EUR");
    expect(bg.costedKm).toBe(25);
    expect(bg.costedLots).toBe(1);
  });

  it("divides only by the length that carries a cost", () => {
    const ro = findCountryPerformance(rows, "ro")!;
    // €100M over the 20 km that has a figure, not over all 30 km opened.
    expect(ro.costPerKm).toBeCloseTo(5, 6);
    expect(ro.costedKm).toBe(20);
  });

  it("leaves shared track out of every figure", () => {
    const ro = findCountryPerformance(rows, "ro")!;
    // The borrowed section is 10 km, cost €900M and 108 months late. Any of
    // those leaking in would be visible immediately.
    expect(ro.lots).toBe(2);
    expect(ro.km).toBe(30);
    expect(ro.slipN).toBe(2);
    expect(ro.costedLots).toBe(1);
  });

  it("returns nothing for an empty dataset", () => {
    expect(
      countryPerformance([], {
        deflate: createDeflator(deflators),
        convert: createConverter(fx),
        priceYear: 2021,
      }),
    ).toEqual([]);
  });
});

describe("findCountryPerformance", () => {
  it("returns null for a country with no measured lots", () => {
    expect(findCountryPerformance(rows, "rs")).toBeNull();
  });
});
