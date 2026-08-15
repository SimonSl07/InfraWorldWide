import { describe, it, expect } from "vitest";
import { constructionProgress, lotMilestones } from "./lot-timeline";
import { monthIndex } from "./contract";
import type { Lot } from "./schema";

const NOW = monthIndex("2026-08")!;

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

const kinds = (l: Lot) => lotMilestones(l, NOW).map((m) => m.kind);

describe("lotMilestones", () => {
  it("lists the recorded dates in the order they happened", () => {
    const milestones = lotMilestones(
      lot({
        status: "opened",
        dates: {
          announced: "2014",
          tenderAwarded: "2018-06",
          constructionStart: "2019-03",
          opened: "2023-11",
        },
      }),
      NOW,
    );
    expect(milestones.map((m) => m.kind)).toEqual([
      "announced",
      "tenderAwarded",
      "constructionStart",
      "opened",
    ]);
    expect(milestones.map((m) => m.date)).toEqual([
      "2014",
      "2018-06",
      "2019-03",
      "2023-11",
    ]);
    expect(milestones.every((m) => !m.future)).toBe(true);
  });

  it("sorts by date, not by field order", () => {
    // Data does exist where a section was announced after the corridor's
    // tender; the timeline must read chronologically whatever the source did.
    const milestones = lotMilestones(
      lot({ dates: { announced: "2019", tenderAwarded: "2018" } }),
      NOW,
    );
    expect(milestones.map((m) => m.kind)).toEqual([
      "tenderAwarded",
      "announced",
    ]);
  });

  it("marks a stated expected opening as still ahead", () => {
    const milestones = lotMilestones(
      lot({ dates: { constructionStart: "2024-01", expectedOpening: "2027" } }),
      NOW,
    );
    const last = milestones[milestones.length - 1];
    expect(last.kind).toBe("expectedOpening");
    expect(last.future).toBe(true);
    expect(last.derived).toBe(false);
    expect(last.date).toBe("2027");
  });

  it("derives an expected opening from the contract when no date is stated", () => {
    const milestones = lotMilestones(
      lot({
        dates: { constructionStart: "2024-01" },
        contract: { executionMonths: 36 },
      }),
      NOW,
    );
    const last = milestones[milestones.length - 1];
    expect(last.kind).toBe("expectedOpening");
    expect(last.derived).toBe(true);
    // Derived, so there is no source date to show: only the month it lands in.
    expect(last.date).toBeNull();
    expect(last.month).toBe(monthIndex("2027-01"));
  });

  it("shows no expected opening once the lot is open", () => {
    expect(
      kinds(
        lot({
          status: "opened",
          dates: { opened: "2023-11", expectedOpening: "2027" },
        }),
      ),
    ).toEqual(["opened"]);
  });

  it("shows no expected opening for a cancelled lot", () => {
    expect(
      kinds(
        lot({
          status: "cancelled",
          dates: { tenderAwarded: "2018" },
          contract: { executionMonths: 24 },
        }),
      ),
    ).toEqual(["tenderAwarded"]);
  });

  it("is empty for a lot with no dates at all", () => {
    expect(lotMilestones(lot({}), NOW)).toEqual([]);
  });

  it("marks a contract date already gone by as past, not as a forecast", () => {
    // A derived deadline in the past is the single most informative thing on
    // a late section, so it must not be dressed up as something still ahead.
    const milestones = lotMilestones(
      lot({
        dates: { constructionStart: "2018-01" },
        contract: { executionMonths: 24 },
      }),
      NOW,
    );
    const last = milestones[milestones.length - 1];
    expect(last.month).toBe(monthIndex("2020-01"));
    expect(last.future).toBe(false);
  });
});

describe("constructionProgress", () => {
  it("measures elapsed against contracted months", () => {
    const progress = constructionProgress(
      lot({
        dates: { constructionStart: "2024-08" },
        contract: { executionMonths: 48 },
      }),
      NOW,
    );
    expect(progress).toEqual({
      elapsedMonths: 24,
      contractedMonths: 48,
      ratio: 0.5,
      overdueMonths: 0,
    });
  });

  it("reports how far past the contracted finish a section has run", () => {
    const progress = constructionProgress(
      lot({
        dates: { constructionStart: "2020-08" },
        contract: { executionMonths: 36 },
      }),
      NOW,
    );
    expect(progress?.elapsedMonths).toBe(72);
    expect(progress?.overdueMonths).toBe(36);
    // Deliberately not clamped: a bar that stops at 100% hides the overrun.
    expect(progress?.ratio).toBeCloseTo(2, 6);
  });

  it("has nothing to say about a lot that is not building", () => {
    expect(
      constructionProgress(
        lot({
          status: "opened",
          dates: { constructionStart: "2020-01", opened: "2023-01" },
          contract: { executionMonths: 36 },
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("has nothing to say without contract terms", () => {
    expect(
      constructionProgress(lot({ dates: { constructionStart: "2024-01" } }), NOW),
    ).toBeNull();
  });

  it("has nothing to say before work starts", () => {
    expect(
      constructionProgress(
        lot({
          dates: { constructionStart: "2027-01" },
          contract: { executionMonths: 24 },
        }),
        NOW,
      ),
    ).toBeNull();
  });
});
