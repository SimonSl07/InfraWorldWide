import { describe, it, expect } from "vitest";
import type { Project } from "./schema";
import { filterProjects, type ProjectFilters } from "./projects-filter";

function makeProject(overrides: Partial<Project> & { id: string }): Project {
  return {
    country: "ro",
    category: "highway",
    name: { en: "Project" },
    description: { en: "Desc" },
    lots: [
      {
        id: "lot-1",
        name: { en: "Lot 1" },
        status: "opened",
        dates: { opened: "2015" },
        lengthKm: 10,
        geometryRef: "lot-1",
      },
    ],
    sources: [{ title: "S", url: "https://example.com" }],
    ...overrides,
  } as Project;
}

const projects: Project[] = [
  makeProject({ id: "ro-a1", name: { en: "A1 Bucharest–Nădlac" } }),
  makeProject({
    id: "ro-bridge",
    country: "ro",
    category: "bridge",
    name: { en: "Brăila Bridge" },
  }),
  makeProject({
    id: "de-rail",
    country: "de",
    category: "railway",
    name: { en: "Stuttgart 21" },
    lots: [
      {
        id: "lot-1",
        name: { en: "Lot 1" },
        status: "under_construction",
        lengthKm: 10,
        geometryRef: "lot-1",
      },
    ],
  }),
];

const noFilters: ProjectFilters = {
  query: "",
  country: null,
  category: null,
  status: null,
};

describe("filterProjects", () => {
  it("returns everything without filters", () => {
    expect(filterProjects(projects, noFilters)).toHaveLength(3);
  });

  it("filters by text query (case-insensitive, name match)", () => {
    expect(
      filterProjects(projects, { ...noFilters, query: "brăila" }).map((p) => p.id),
    ).toEqual(["ro-bridge"]);
    expect(
      filterProjects(projects, { ...noFilters, query: "BRIDGE" }).map((p) => p.id),
    ).toEqual(["ro-bridge"]);
  });

  it("matches through any locale key, not only en and ro", () => {
    // The schema admits any locale key, so the search reads every value
    // rather than a named pair; here only the German name matches.
    const bridge = makeProject({
      id: "de-bridge",
      country: "de",
      category: "bridge",
      name: { en: "Bridge", de: "Brücke" },
    });
    expect(
      filterProjects([bridge], { ...noFilters, query: "brücke" }).map((p) => p.id),
    ).toEqual(["de-bridge"]);

    // Same for a section name.
    const rail = makeProject({
      id: "de-rail-lot",
      lots: [
        { ...projects[2].lots[0], name: { en: "Lot 1", de: "Abschnitt 1" } },
      ],
    });
    expect(
      filterProjects([rail], { ...noFilters, query: "abschnitt" }).map(
        (p) => p.id,
      ),
    ).toEqual(["de-rail-lot"]);
  });

  it("filters by country", () => {
    expect(
      filterProjects(projects, { ...noFilters, country: "de" }).map((p) => p.id),
    ).toEqual(["de-rail"]);
  });

  it("filters by category", () => {
    expect(
      filterProjects(projects, { ...noFilters, category: "railway" }).map(
        (p) => p.id,
      ),
    ).toEqual(["de-rail"]);
  });

  it("filters by status when any lot matches", () => {
    expect(
      filterProjects(projects, { ...noFilters, status: "under_construction" }).map(
        (p) => p.id,
      ),
    ).toEqual(["de-rail"]);
    expect(
      filterProjects(projects, { ...noFilters, status: "opened" }),
    ).toHaveLength(2);
  });

  it("combines filters", () => {
    expect(
      filterProjects(projects, { ...noFilters, country: "ro", category: "bridge" }).map(
        (p) => p.id,
      ),
    ).toEqual(["ro-bridge"]);
    expect(
      filterProjects(projects, { ...noFilters, country: "ro", query: "zzz" }),
    ).toHaveLength(0);
  });
});
