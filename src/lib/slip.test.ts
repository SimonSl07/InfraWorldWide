import { describe, it, expect } from "vitest";
import { computeSlip, currentMonth } from "./slip";
import { monthIndex } from "./contract";
import type { Lot } from "./schema";

const at = (date: string) => monthIndex(date)!;

function lot(overrides: Partial<Lot>): Lot {
  return {
    id: "l1",
    name: { en: "Lot 1" },
    status: "under_construction",
    lengthKm: 10,
    geometryRef: "l1",
    ...overrides,
  } as Lot;
}

describe("computeSlip — completed lots", () => {
  const opened = (openedDate: string) =>
    lot({
      status: "opened",
      dates: { constructionStart: "2019-01", opened: openedDate },
      contract: { executionMonths: 24 },
    });

  it("measures delivery against the contract-implied date", () => {
    const s = computeSlip(opened("2022-07"), at("2026-08"));
    // Jan 2019 + 24 months = Jan 2021; opened Jul 2022 → 18 months late.
    expect(s).toMatchObject({
      kind: "completed",
      reference: "opened",
      slipMonths: 18,
      anchor: "constructionStart",
      contractMonths: 24,
    });
    expect(s!.plannedMonth).toBe(at("2021-01"));
  });

  it("reports early delivery as negative slip", () => {
    expect(computeSlip(opened("2020-07"), at("2026-08"))!.slipMonths).toBe(-6);
  });

  it("reports zero for a lot delivered exactly on the contract date", () => {
    expect(computeSlip(opened("2021-01"), at("2026-08"))!.slipMonths).toBe(0);
  });

  it("counts only the execution period from construction start", () => {
    const s = computeSlip(
      lot({
        status: "opened",
        dates: { constructionStart: "2019-01", opened: "2022-07" },
        contract: { designMonths: 6, executionMonths: 24 },
      }),
      at("2026-08"),
    );
    // The 6 design months ran BEFORE construction started, so only the 24
    // execution months apply: Jan 2019 + 24 = Jan 2021 → 18 months late.
    // Adding all 30 would credit the builder with time it was never given.
    expect(s!.slipMonths).toBe(18);
    expect(s!.baselineMonths).toBe(24);
    expect(s!.contractMonths).toBe(30);
  });

  it("ignores a combined total when measuring from construction start", () => {
    const s = computeSlip(
      lot({
        status: "opened",
        dates: { constructionStart: "2019-01", opened: "2022-07" },
        contract: { designMonths: 6, executionMonths: 24, totalMonths: 36 },
      }),
      at("2026-08"),
    );
    // totalMonths includes design, so it is the wrong duration to hang on a
    // construction start — still Jan 2019 + 24 = Jan 2021 → 18 late.
    expect(s!.slipMonths).toBe(18);
    expect(s!.baselineMonths).toBe(24);
    // The full contracted duration is still reported for context.
    expect(s!.contractMonths).toBe(36);
  });

  it("counts the whole contracted clock from the tender award", () => {
    const s = computeSlip(
      lot({
        status: "opened",
        // No construction start, so the award anchors the full 30 months.
        dates: { tenderAwarded: "2019-01", opened: "2022-07" },
        contract: { designMonths: 6, executionMonths: 24 },
      }),
      at("2026-08"),
    );
    // Jan 2019 + 30 = Jul 2021 → 12 months late.
    expect(s).toMatchObject({
      anchor: "tenderAwarded",
      baselineMonths: 30,
      slipMonths: 12,
    });
  });

  it("falls back to a lone total when execution months are unknown", () => {
    const s = computeSlip(
      lot({
        status: "opened",
        dates: { constructionStart: "2019-01", opened: "2022-07" },
        contract: { totalMonths: 30 },
      }),
      at("2026-08"),
    );
    expect(s).toMatchObject({
      anchor: "constructionStart",
      baselineMonths: 30,
      slipMonths: 12,
    });
  });

  it("prefers construction start over the award when both are usable", () => {
    const s = computeSlip(
      lot({
        status: "opened",
        dates: {
          tenderAwarded: "2018-01",
          constructionStart: "2019-01",
          opened: "2022-07",
        },
        contract: { designMonths: 6, executionMonths: 24 },
      }),
      at("2026-08"),
    );
    expect(s).toMatchObject({
      anchor: "constructionStart",
      baselineMonths: 24,
    });
  });

  it("falls back to the award date when construction start is unknown", () => {
    const s = computeSlip(
      lot({
        status: "opened",
        dates: { tenderAwarded: "2019-01", opened: "2022-01" },
        contract: { executionMonths: 24 },
      }),
      at("2026-08"),
    );
    expect(s).toMatchObject({ anchor: "tenderAwarded", slipMonths: 12 });
  });

  it("treats a year-only date as January", () => {
    const s = computeSlip(
      lot({
        status: "opened",
        dates: { constructionStart: "2019", opened: "2021" },
        contract: { executionMonths: 24 },
      }),
      at("2026-08"),
    );
    expect(s!.slipMonths).toBe(0);
  });
});

describe("computeSlip — ongoing lots", () => {
  const wip = (dates: Lot["dates"]) =>
    lot({
      status: "under_construction",
      dates: { constructionStart: "2019-01", ...dates },
      contract: { executionMonths: 24 },
    });

  it("uses an announced opening still in the future", () => {
    const s = computeSlip(wip({ expectedOpening: "2027-01" }), at("2026-08"));
    expect(s).toMatchObject({
      kind: "ongoing",
      reference: "expectedOpening",
      slipMonths: 72,
    });
  });

  it("uses today once the announced opening has itself passed", () => {
    const s = computeSlip(wip({ expectedOpening: "2024-01" }), at("2026-08"));
    expect(s).toMatchObject({ reference: "now", slipMonths: 67 });
  });

  it("counts an overdue lot with no announced opening from today", () => {
    const s = computeSlip(wip({}), at("2026-08"));
    expect(s).toMatchObject({ reference: "now", slipMonths: 67 });
  });

  it("credits an announced opening that beats the contract", () => {
    const s = computeSlip(
      lot({
        status: "under_construction",
        dates: { constructionStart: "2025-01", expectedOpening: "2026-01" },
        contract: { executionMonths: 24 },
      }),
      at("2025-06"),
    );
    expect(s!.slipMonths).toBe(-12);
  });

  it("stays silent for a lot that is simply not due yet", () => {
    // Started 2025-01, due 2027-01, nothing announced, today is 2026-08.
    expect(
      computeSlip(
        lot({
          status: "under_construction",
          dates: { constructionStart: "2025-01" },
          contract: { executionMonths: 24 },
        }),
        at("2026-08"),
      ),
    ).toBeNull();
  });

  it("applies to tendered and planned lots too", () => {
    const s = computeSlip(
      lot({
        status: "tendered",
        dates: { tenderAwarded: "2019-01", expectedOpening: "2027-01" },
        contract: { totalMonths: 24 },
      }),
      at("2026-08"),
    );
    expect(s).toMatchObject({ kind: "ongoing", slipMonths: 72 });
  });
});

describe("computeSlip — no claim possible", () => {
  it("returns null for a cancelled lot", () => {
    expect(
      computeSlip(
        lot({
          status: "cancelled",
          dates: { constructionStart: "2019-01" },
          contract: { executionMonths: 24 },
        }),
        at("2026-08"),
      ),
    ).toBeNull();
  });

  it("returns null without a contract block", () => {
    expect(
      computeSlip(
        lot({
          status: "opened",
          dates: { constructionStart: "2019-01", opened: "2022-01" },
        }),
        at("2026-08"),
      ),
    ).toBeNull();
  });

  it("returns null when the contract states no duration", () => {
    expect(
      computeSlip(
        lot({
          status: "opened",
          dates: { constructionStart: "2019-01", opened: "2022-01" },
          contract: { noticeReference: "TED-123" },
        }),
        at("2026-08"),
      ),
    ).toBeNull();
  });

  it("returns null without an anchor date", () => {
    expect(
      computeSlip(
        lot({
          status: "opened",
          dates: { opened: "2022-01" },
          contract: { executionMonths: 24 },
        }),
        at("2026-08"),
      ),
    ).toBeNull();
  });

  it("returns null for an opened lot with no opening date", () => {
    expect(
      computeSlip(
        lot({
          status: "opened",
          dates: { constructionStart: "2019-01" },
          contract: { executionMonths: 24 },
        }),
        at("2026-08"),
      ),
    ).toBeNull();
  });

  /**
   * Taken from a real record: A8 Moțca–Târgu Frumos carries tenderAwarded
   * 2026-04 against expectedOpening 2026. A lot cannot open before the
   * contract that builds it was awarded, and treating the pair as real
   * reported the lot 42 months EARLY while it was still under construction,
   * which then pulled down its country's and its builder's medians.
   */
  it("returns null when the expected opening precedes the award", () => {
    expect(
      computeSlip(
        lot({
          status: "under_construction",
          dates: { tenderAwarded: "2026-04", expectedOpening: "2026-01" },
          contract: { designMonths: 10, executionMonths: 36 },
        }),
        at("2026-08"),
      ),
    ).toBeNull();
  });

  it("still measures an expected opening that follows the award", () => {
    const slip = computeSlip(
      lot({
        status: "under_construction",
        dates: { tenderAwarded: "2020-01", expectedOpening: "2026-01" },
        contract: { designMonths: 10, executionMonths: 36 },
      }),
      at("2024-01"),
    );
    expect(slip).not.toBeNull();
    expect(slip!.anchor).toBe("tenderAwarded");
  });
});

describe("currentMonth", () => {
  it("matches monthIndex for the same month", () => {
    expect(currentMonth(new Date("2026-08-07T00:00:00Z"))).toBe(at("2026-08"));
  });
});
