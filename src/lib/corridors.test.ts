import { describe, it, expect } from "vitest";
import {
  corridorProjects,
  corridorSummary,
  corridorsOfProject,
  listCorridors,
} from "./corridors";
import { monthIndex } from "./contract";
import type { CorridorTable, Lot, Project } from "./schema";

const NOW = monthIndex("2026-08")!;

const table: CorridorTable = {
  note: "test",
  corridors: {
    "ten-t-rhine-danube": {
      scheme: "ten-t",
      name: {
        en: "TEN-T Rhine–Danube Corridor",
        ro: "Coridorul TEN-T Rin–Dunăre",
      },
      route: "Strasbourg – Vienna – Budapest – Arad – Brașov – Constanța",
      sources: [{ title: "EC", url: "https://example.org/tent" }],
    },
    "pan-european-iv": {
      scheme: "pan-european",
      name: { en: "Pan-European Corridor IV" },
      sources: [{ title: "Wikipedia", url: "https://example.org/iv" }],
    },
    "pan-european-x": {
      scheme: "pan-european",
      name: { en: "Pan-European Corridor X" },
      sources: [{ title: "Wikipedia", url: "https://example.org/x" }],
    },
  },
};

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

function project(
  id: string,
  corridors: string[] | undefined,
  lots: Lot[],
): Project {
  return {
    id,
    country: id.slice(0, 2),
    category: "highway",
    name: { en: id.toUpperCase() },
    description: { en: id },
    lots,
    ...(corridors ? { corridors } : {}),
    sources: [{ title: "t", url: "https://example.org" }],
  } as Project;
}

const roA1 = project(
  "ro-a1",
  ["pan-european-iv"],
  [
    lot({ status: "opened", lengthKm: 40, dates: { opened: "2015" } }),
    lot({
      status: "under_construction",
      lengthKm: 20,
      dates: { constructionStart: "2024-01" },
    }),
  ],
);
const bgA3 = project(
  "bg-a3",
  ["pan-european-iv"],
  [
    lot({ status: "opened", lengthKm: 30, dates: { opened: "2019" } }),
    lot({ status: "planned", lengthKm: 15 }),
  ],
);
const rsX = project(
  "rs-x",
  ["pan-european-x"],
  [lot({ status: "opened", lengthKm: 25, dates: { opened: "2018" } })],
);
const unlisted = project("ro-a2", undefined, [
  lot({ status: "opened", lengthKm: 50, dates: { opened: "2012" } }),
]);

const projects = [roA1, bgA3, rsX, unlisted];

describe("listCorridors", () => {
  it("groups the two designation schemes without merging them", () => {
    // The schemes are different instruments: Pan-European is how these
    // projects were described when planned, TEN-T is what money runs on
    // today. Presenting one as the other would rewrite the sources.
    const list = listCorridors(table, projects, NOW);
    expect(list.map((c) => c.id)).toEqual([
      "pan-european-iv",
      "pan-european-x",
      "ten-t-rhine-danube",
    ]);
    expect(list.map((c) => c.corridor.scheme)).toEqual([
      "pan-european",
      "pan-european",
      "ten-t",
    ]);
  });

  it("carries each corridor's project count and open length", () => {
    const iv = listCorridors(table, projects, NOW).find(
      (c) => c.id === "pan-european-iv",
    )!;
    expect(iv.summary.projects).toBe(2);
    expect(iv.summary.openedKm).toBe(70);
  });

  it("keeps a corridor no project claims, rather than hiding the gap", () => {
    const list = listCorridors(table, projects, NOW);
    const empty = list.find((c) => c.id === "ten-t-rhine-danube")!;
    expect(empty.summary.projects).toBe(0);
  });
});

describe("corridorProjects", () => {
  it("returns the projects that claim the corridor", () => {
    expect(
      corridorProjects(projects, "pan-european-iv").map((p) => p.id),
    ).toEqual(["ro-a1", "bg-a3"]);
  });

  it("is empty for a corridor nothing claims", () => {
    expect(corridorProjects(projects, "ten-t-rhine-danube")).toEqual([]);
  });
});

describe("corridorSummary", () => {
  const summary = corridorSummary(projects, "pan-european-iv", NOW);

  it("totals what is open, building and planned along it", () => {
    expect(summary.openedKm).toBe(70);
    expect(summary.underConstructionKm).toBe(20);
    expect(summary.plannedKm).toBe(15);
    expect(summary.totalKm).toBe(105);
  });

  it("breaks the corridor down by country, in descending open length", () => {
    // The whole point of a corridor view is that it crosses borders, so the
    // per-country split is the view, not a detail.
    expect(summary.byCountry.map((c) => c.country)).toEqual(["ro", "bg"]);
    expect(summary.byCountry[0]).toMatchObject({
      country: "ro",
      projects: 1,
      openedKm: 40,
      underConstructionKm: 20,
    });
  });

  it("counts a country once however many projects it has there", () => {
    expect(summary.byCountry).toHaveLength(2);
    expect(summary.countries).toBe(2);
  });

  it("leaves out track another project already measures", () => {
    // A corridor total spans projects by construction, so the rule that
    // governs every other cross-project total governs this one.
    const withShared = [
      ...projects,
      project(
        "ro-a1-alt",
        ["pan-european-iv"],
        [
          lot({
            status: "opened",
            lengthKm: 8,
            dates: { opened: "2015" },
            sharedWith: "ro-a1",
          }),
          lot({
            status: "opened",
            lengthKm: 3,
            dates: { opened: "2015" },
            partOf: "ro-a1",
          }),
        ],
      ),
    ];
    expect(corridorSummary(withShared, "pan-european-iv", NOW).openedKm).toBe(
      70,
    );
  });
});

describe("corridorsOfProject", () => {
  it("resolves a project's corridor keys, most recent scheme first", () => {
    // A project in both schemes shows TEN-T first: it is the designation the
    // money runs on today, and the historic one reads as context after it.
    const both = project(
      "ro-rail",
      ["pan-european-iv", "ten-t-rhine-danube"],
      [],
    );
    expect(corridorsOfProject(both, table).map((c) => c.id)).toEqual([
      "ten-t-rhine-danube",
      "pan-european-iv",
    ]);
  });

  it("drops a key the table does not know rather than rendering a blank", () => {
    const ghost = project("ro-ghost", ["not-a-corridor"], []);
    expect(corridorsOfProject(ghost, table)).toEqual([]);
  });

  it("is empty for a project with no designation", () => {
    expect(corridorsOfProject(unlisted, table)).toEqual([]);
  });
});
