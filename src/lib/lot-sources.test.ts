import { describe, it, expect } from "vitest";
import { lotCitations, numberSources } from "./lot-sources";
import type { Lot, Source } from "./schema";

const projectSources: Source[] = [
  { id: "cnair-2023", title: "CNAIR report", url: "https://cnair.ro/a" },
  { id: "wiki-a1", title: "Wikipedia: A1", url: "https://ro.wikipedia.org/a1" },
  { title: "Press release", url: "https://example.org/press" },
];

function lot(overrides: Partial<Lot>): Lot {
  return {
    id: "l1",
    name: { en: "Lot 1" },
    status: "opened",
    dates: { opened: "2020" },
    lengthKm: 10,
    geometryRef: "g",
    ...overrides,
  } as Lot;
}

describe("numberSources", () => {
  it("numbers the project's sources from one, in the order listed", () => {
    const numbers = numberSources(projectSources);
    expect(numbers.get("https://cnair.ro/a")).toBe(1);
    expect(numbers.get("https://example.org/press")).toBe(3);
  });
});

describe("lotCitations", () => {
  it("resolves the ids a lot points at, in the project's order", () => {
    const citations = lotCitations(
      lot({ sourceRefs: ["wiki-a1", "cnair-2023"] }),
      projectSources,
    );
    expect(citations.refs.map((s) => s.id)).toEqual(["cnair-2023", "wiki-a1"]);
    expect(citations.unresolved).toEqual([]);
  });

  it("reports an id that matches no project source instead of dropping it", () => {
    // Silently ignoring it would make a citation that points nowhere look
    // exactly like a lot with no citation at all.
    const citations = lotCitations(
      lot({ sourceRefs: ["cnair-2023", "ghost"] }),
      projectSources,
    );
    expect(citations.refs.map((s) => s.id)).toEqual(["cnair-2023"]);
    expect(citations.unresolved).toEqual(["ghost"]);
  });

  it("keeps sources recorded on the lot itself", () => {
    const own: Source = {
      title: "Award notice",
      url: "https://ted.europa.eu/1",
    };
    const citations = lotCitations(lot({ sources: [own] }), projectSources);
    expect(citations.own).toEqual([own]);
  });

  it("does not repeat a lot source that is already a project source", () => {
    const citations = lotCitations(
      lot({
        sourceRefs: ["cnair-2023"],
        sources: [{ title: "CNAIR report", url: "https://cnair.ro/a" }],
      }),
      projectSources,
    );
    expect(citations.refs).toHaveLength(1);
    expect(citations.own).toEqual([]);
  });

  it("has nothing for a lot that cites nothing of its own", () => {
    const citations = lotCitations(lot({}), projectSources);
    expect(citations).toEqual({ refs: [], own: [], unresolved: [] });
  });
});
