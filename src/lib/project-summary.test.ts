import { describe, it, expect } from "vitest";
import { fundingBreakdown, projectTotals } from "./project-summary";
import { monthIndex } from "./contract";
import type { Lot, Project } from "./schema";

const NOW = monthIndex("2026-08")!;

function lot(overrides: Partial<Lot>): Lot {
  return {
    id: `l${Math.random()}`,
    name: { en: "Lot" },
    status: "planned",
    lengthKm: 10,
    geometryRef: "g",
    ...overrides,
  } as Lot;
}

function project(lots: Lot[]): Project {
  return {
    id: "ro-a1",
    country: "ro",
    category: "highway",
    name: { en: "A1" },
    description: { en: "A1" },
    lots,
    sources: [{ title: "t", url: "https://example.org" }],
  } as Project;
}

describe("projectTotals", () => {
  const p = project([
    lot({ status: "opened", lengthKm: 40, dates: { opened: "2015" } }),
    lot({
      status: "under_construction",
      lengthKm: 25,
      dates: { constructionStart: "2024-01" },
    }),
    lot({ status: "planned", lengthKm: 35 }),
  ]);

  it("adds up the project's own length and what is open today", () => {
    const totals = projectTotals(p, NOW);
    expect(totals.lots).toBe(3);
    expect(totals.totalKm).toBe(100);
    expect(totals.openedKm).toBe(40);
    expect(totals.underConstructionKm).toBe(25);
  });

  it("counts shared track in the project's own length and reports it", () => {
    // A line really is as long as the track it runs on, so the total keeps
    // it. Saying how much is counted elsewhere too is what lets a reader
    // reconcile this page with a network total that counts it once.
    const shared = project([
      lot({ status: "opened", lengthKm: 40, dates: { opened: "2015" } }),
      lot({
        status: "opened",
        lengthKm: 8.67,
        dates: { opened: "2015" },
        sharedWith: "ro-metro-m1",
      }),
    ]);
    const totals = projectTotals(shared, NOW);
    expect(totals.totalKm).toBeCloseTo(48.67, 6);
    expect(totals.alsoCountedElsewhereKm).toBeCloseTo(8.67, 6);
  });

  it("reports a contained section the same way as shared track", () => {
    // ro-tunnels holds structures inside A1 sections that measure their own
    // length. The tunnel project's own page still shows all of them.
    const tunnels = project([
      lot({
        status: "under_construction",
        lengthKm: 1.701,
        partOf: "ro-a1",
        dates: { constructionStart: "2022-01" },
      }),
      lot({
        status: "under_construction",
        lengthKm: 1.578,
        partOf: "ro-a1",
        dates: { constructionStart: "2022-01" },
      }),
    ]);
    const totals = projectTotals(tunnels, NOW);
    expect(totals.totalKm).toBeCloseTo(3.279, 6);
    expect(totals.underConstructionKm).toBeCloseTo(3.279, 6);
    expect(totals.alsoCountedElsewhereKm).toBeCloseTo(3.279, 6);
  });

  it("follows the map's view of what is open, not the declared status", () => {
    // An old section with an opening date and no recorded start is open, and
    // a section whose stated status lags its dates must not contradict the map.
    const totals = projectTotals(
      project([
        lot({ status: "planned", lengthKm: 12, dates: { opened: "1999" } }),
      ]),
      NOW,
    );
    expect(totals.openedKm).toBe(12);
  });
});

describe("fundingBreakdown", () => {
  it("adds up sections and kilometres per funding source", () => {
    const rows = fundingBreakdown(
      project([
        lot({ lengthKm: 30, funding: [{ source: "EU" }, { source: "loan" }] }),
        lot({ lengthKm: 20, funding: [{ source: "EU" }] }),
        lot({ lengthKm: 5 }),
      ]),
    );
    expect(rows).toEqual([
      { source: "EU", lots: 2, km: 50, details: [] },
      { source: "loan", lots: 1, km: 30, details: [] },
    ]);
  });

  it("orders by kilometres, so the biggest instrument reads first", () => {
    const rows = fundingBreakdown(
      project([
        lot({ lengthKm: 10, funding: [{ source: "national_budget" }] }),
        lot({ lengthKm: 90, funding: [{ source: "EU" }] }),
      ]),
    );
    expect(rows.map((r) => r.source)).toEqual(["EU", "national_budget"]);
  });

  it("keeps each distinct detail once", () => {
    const rows = fundingBreakdown(
      project([
        lot({
          lengthKm: 10,
          funding: [{ source: "EU", detail: { en: "CEF, 85%" } }],
        }),
        lot({
          lengthKm: 10,
          funding: [{ source: "EU", detail: { en: "CEF, 85%" } }],
        }),
        lot({
          lengthKm: 10,
          funding: [{ source: "EU", detail: { en: "Cohesion Fund" } }],
        }),
      ]),
    );
    expect(rows[0].details).toEqual([
      { en: "CEF, 85%" },
      { en: "Cohesion Fund" },
    ]);
  });

  it("is empty when no section records a funding source", () => {
    expect(fundingBreakdown(project([lot({ lengthKm: 10 })]))).toEqual([]);
  });
});
