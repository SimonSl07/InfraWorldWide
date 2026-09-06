import { describe, it, expect } from "vitest";
import type { Project } from "./schema";
import { getOpenings } from "./timeline";

function lot(
  id: string,
  dates?: {
    opened?: string;
    expectedOpening?: string;
    constructionStart?: string;
  },
) {
  return {
    id,
    name: { en: `Lot ${id}` },
    status: dates?.opened
      ? ("opened" as const)
      : ("under_construction" as const),
    dates,
    lengthKm: 10,
    geometryRef: id,
  };
}

const projects: Project[] = [
  {
    id: "ro-a1",
    country: "ro",
    category: "highway",
    name: { en: "A1" },
    description: { en: "" },
    lots: [lot("old", { opened: "1972" }), lot("new", { opened: "2018-06" })],
    sources: [{ title: "S", url: "https://example.com" }],
  },
  {
    id: "ro-a3",
    country: "ro",
    category: "highway",
    name: { en: "A3" },
    description: { en: "" },
    lots: [
      lot("future", { expectedOpening: "2028" }),
      lot("no-dates"),
      lot("mid", { opened: "2012" }),
    ],
    sources: [{ title: "S", url: "https://example.com" }],
  },
];

describe("getOpenings", () => {
  const { past, scheduled } = getOpenings(projects);

  it("lists past openings newest first", () => {
    expect(past.map((o) => o.lotId)).toEqual(["new", "mid", "old"]);
    expect(past[0].date).toBe("2018-06");
    expect(past[0].projectId).toBe("ro-a1");
  });

  it("lists scheduled openings soonest first", () => {
    expect(scheduled.map((o) => o.lotId)).toEqual(["future"]);
    expect(scheduled[0].date).toBe("2028");
  });

  it("ignores lots with no opening info", () => {
    expect(past.some((o) => o.lotId === "no-dates")).toBe(false);
    expect(scheduled.some((o) => o.lotId === "no-dates")).toBe(false);
  });

  it("carries category, country and length onto each opening", () => {
    expect(past[0]).toMatchObject({
      category: "highway",
      country: "ro",
      lengthKm: 10,
    });
  });
});
