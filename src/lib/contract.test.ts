import { describe, it, expect } from "vitest";
import {
  contractBaseline,
  contractMonths,
  monthIndex,
  projectedCompletionYear,
  expectedOpeningYear,
} from "./contract";
import type { Lot } from "./schema";

describe("contractMonths", () => {
  it("prefers an explicit total", () => {
    expect(contractMonths({ totalMonths: 30, designMonths: 6 })).toBe(30);
  });
  it("sums design and execution", () => {
    expect(contractMonths({ designMonths: 6, executionMonths: 24 })).toBe(30);
    expect(contractMonths({ executionMonths: 40, designMonths: 14 })).toBe(54);
  });
  it("returns null when no duration is known", () => {
    expect(contractMonths({})).toBeNull();
    expect(contractMonths({ guaranteeMonths: 84 })).toBeNull();
  });
});

describe("projectedCompletionYear", () => {
  it("adds contracted months to a year-month start", () => {
    // Feb 2024 + 30 months = Aug 2026
    expect(
      projectedCompletionYear("2024-02", { designMonths: 6, executionMonths: 24 }),
    ).toBe(2026);
  });
  it("treats a year-only start as January", () => {
    // Jan 2023 + 54 months = Jul 2027
    expect(
      projectedCompletionYear("2023", { designMonths: 14, executionMonths: 40 }),
    ).toBe(2027);
  });
  it("handles full dates", () => {
    expect(
      projectedCompletionYear("2023-09-15", { totalMonths: 36 }),
    ).toBe(2026);
  });
  it("returns null on missing inputs", () => {
    expect(projectedCompletionYear(undefined, { totalMonths: 12 })).toBeNull();
    expect(projectedCompletionYear("2024-02", undefined)).toBeNull();
    expect(projectedCompletionYear("2024-02", {})).toBeNull();
  });
});

function lot(overrides: Partial<Lot>): Lot {
  return {
    id: "x",
    name: { en: "X" },
    status: "under_construction",
    lengthKm: 10,
    geometryRef: "x",
    ...overrides,
  } as Lot;
}

describe("expectedOpeningYear", () => {
  it("prefers an explicitly sourced expectedOpening", () => {
    expect(
      expectedOpeningYear(
        lot({
          dates: { constructionStart: "2024-02", expectedOpening: "2028" },
          contract: { designMonths: 6, executionMonths: 24 },
        }),
      ),
    ).toBe(2028);
  });
  it("derives from contract terms when no explicit date exists", () => {
    expect(
      expectedOpeningYear(
        lot({
          dates: { constructionStart: "2024-02" },
          contract: { designMonths: 6, executionMonths: 24 },
        }),
      ),
    ).toBe(2026);
  });
  it("falls back to the tender award date as the clock start", () => {
    expect(
      expectedOpeningYear(
        lot({
          dates: { tenderAwarded: "2023-09" },
          contract: { totalMonths: 54 },
        }),
      ),
    ).toBe(2028);
  });
  it("returns null when nothing is known", () => {
    expect(expectedOpeningYear(lot({}))).toBeNull();
  });

  it("returns null for lots already opened or cancelled", () => {
    expect(
      expectedOpeningYear(
        lot({
          status: "opened",
          dates: { constructionStart: "2016-05", opened: "2020-12-02" },
          contract: { executionMonths: 36 },
        }),
      ),
    ).toBeNull();
    expect(
      expectedOpeningYear(
        lot({ status: "cancelled", contract: { totalMonths: 24 }, dates: { constructionStart: "2020" } }),
      ),
    ).toBeNull();
  });
});

describe("contractBaseline", () => {
  it("measures execution only from a construction start", () => {
    expect(
      contractBaseline(
        lot({
          dates: { constructionStart: "2022-01" },
          contract: { designMonths: 6, executionMonths: 24 },
        }),
      ),
    ).toEqual({ month: monthIndex("2024-01"), anchor: "constructionStart", months: 24 });
  });

  it("measures the full contracted clock from an award", () => {
    expect(
      contractBaseline(
        lot({
          dates: { tenderAwarded: "2021-07" },
          contract: { designMonths: 6, executionMonths: 24 },
        }),
      ),
    ).toEqual({ month: monthIndex("2024-01"), anchor: "tenderAwarded", months: 30 });
  });

  it("agrees on the deadline whichever anchor the data supports", () => {
    // DEx16: signed Jul 2021, 6 design + 24 execution, construction from
    // Jan 2022. Both routes must land on Jan 2024 — the old code added all
    // 30 months to the construction start and produced Jul 2024.
    const fromStart = contractBaseline(
      lot({
        dates: { constructionStart: "2022" },
        contract: { designMonths: 6, executionMonths: 24 },
      }),
    );
    const fromAward = contractBaseline(
      lot({
        dates: { tenderAwarded: "2021-07" },
        contract: { designMonths: 6, executionMonths: 24 },
      }),
    );
    expect(fromStart!.month).toBe(fromAward!.month);
    expect(fromStart!.month).toBe(monthIndex("2024-01"));
  });

  it("falls back to a lone total hung on the construction start", () => {
    expect(
      contractBaseline(
        lot({ dates: { constructionStart: "2020" }, contract: { totalMonths: 18 } }),
      ),
    ).toEqual({ month: monthIndex("2021-07"), anchor: "constructionStart", months: 18 });
  });

  it("returns null without a contract or without any anchor date", () => {
    expect(contractBaseline(lot({ dates: { constructionStart: "2020" } }))).toBeNull();
    expect(contractBaseline(lot({ contract: { executionMonths: 24 } }))).toBeNull();
    expect(
      contractBaseline(lot({ dates: { opened: "2020" }, contract: { guaranteeMonths: 60 } })),
    ).toBeNull();
  });
});
