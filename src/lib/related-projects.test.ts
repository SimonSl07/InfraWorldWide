import { describe, it, expect } from "vitest";
import { relatedProjects } from "./related-projects";
import type { Project } from "./schema";

/** Folds "Astaldi SpA" and "Astaldi" onto one id, as the registry does. */
const resolve = (raw: string) => [
  { id: raw.toLowerCase().split(" ")[0], name: raw, kind: "firm" as const },
];

function project(
  id: string,
  contractors: string[],
  overrides: Partial<Project> = {},
): Project {
  return {
    id,
    country: id.slice(0, 2),
    category: "highway",
    name: { en: id },
    description: { en: id },
    lots: [
      {
        id: "l1",
        name: { en: "Lot 1" },
        status: "opened",
        dates: { opened: "2020" },
        lengthKm: 10,
        geometryRef: "g",
        contractors: contractors.map((name) => ({ name })),
      },
    ],
    sources: [{ title: "t", url: "https://example.org" }],
    ...overrides,
  } as Project;
}

const a1 = project("ro-a1", ["Astaldi SpA", "Impresa Pizzarotti"]);
const a3 = project("ro-a3", ["Astaldi"]);
const a7 = project("ro-a7", ["Umbrella"]);
const bgA2 = project("bg-a2", ["Trace Group"]);
const roRail = project("ro-rail", ["Umbrella"], { category: "railway" });

const all = [a1, a3, a7, bgA2, roRail];
const ids = (list: ReturnType<typeof relatedProjects>) =>
  list.map((r) => r.project.id);

describe("relatedProjects", () => {
  it("puts a shared contractor first, and names the firm", () => {
    const related = relatedProjects(a1, all, { resolve });
    expect(related[0].project.id).toBe("ro-a3");
    expect(related[0].reason).toBe("contractor");
    expect(related[0].shared).toEqual(["Astaldi"]);
  });

  it("folds name variants onto one firm before comparing", () => {
    // "Astaldi SpA" and "Astaldi" are the same company; matching on the raw
    // strings would find nothing.
    expect(ids(relatedProjects(a1, all, { resolve }))).toContain("ro-a3");
  });

  it("falls back to the same country and category", () => {
    const related = relatedProjects(a7, all, { resolve });
    // ro-rail shares the contractor, so it leads; the two other Romanian
    // motorways follow on country and category alone.
    expect(ids(related)).toEqual(["ro-rail", "ro-a1", "ro-a3"]);
    expect(related.map((r) => r.reason)).toEqual([
      "contractor",
      "country_category",
      "country_category",
    ]);
  });

  it("returns nothing rather than reaching for a weaker link", () => {
    // Bulgaria's only project here shares no contractor with anything and is
    // the only Bulgarian motorway. "Related" has to mean something.
    expect(relatedProjects(bgA2, all, { resolve })).toEqual([]);
  });

  it("never lists the project itself", () => {
    expect(ids(relatedProjects(a1, all, { resolve }))).not.toContain("ro-a1");
  });

  it("does not relate a railway to a motorway on country alone", () => {
    expect(ids(relatedProjects(roRail, all, { resolve }))).toEqual(["ro-a7"]);
  });

  it("honours the limit, keeping the strongest links", () => {
    expect(ids(relatedProjects(a7, all, { resolve, limit: 1 }))).toEqual([
      "ro-rail",
    ]);
  });
});
