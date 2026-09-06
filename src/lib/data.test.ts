import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The artifact readers had no tests at all.
 *
 * The module memoizes each artifact, so every case re-imports it against a
 * fresh stubbed filesystem.
 */

const projects = {
  generated: "2026-08-14T00:00:00.000Z",
  commit: "abc1234",
  projects: [
    {
      id: "ro-a1",
      country: "ro",
      category: "highway",
      name: { en: "A1" },
      description: { en: "" },
      lots: [],
      sources: [],
    },
    {
      id: "ro-metro-m2",
      country: "ro",
      category: "railway",
      city: "ro-bucharest",
      name: { en: "M2" },
      description: { en: "" },
      lots: [],
      sources: [],
    },
    {
      id: "bg-sofia-metro-m1",
      country: "bg",
      category: "railway",
      city: "bg-sofia",
      name: { en: "M1" },
      description: { en: "" },
      lots: [],
      sources: [],
    },
    {
      id: "bg-a1-trakia",
      country: "bg",
      category: "highway",
      name: { en: "Trakia" },
      description: { en: "" },
      lots: [],
      sources: [],
    },
  ],
};

const cities = {
  cities: {
    "ro-bucharest": { name: { en: "Bucharest" }, country: "ro" },
    "bg-sofia": { name: { en: "Sofia" }, country: "bg" },
  },
};

const files: Record<string, unknown> = {
  "projects.json": projects,
  "cities.json": cities,
};

let reads = 0;

vi.mock("node:fs", () => ({
  default: {
    readFileSync: (file: string) => {
      reads++;
      const name = String(file).replace(/\\/g, "/").split("public/data/")[1];
      if (!(name in files)) throw new Error(`unexpected read: ${name}`);
      return JSON.stringify(files[name]);
    },
  },
}));

type DataModule = typeof import("./data");

async function loadData(): Promise<DataModule> {
  vi.resetModules();
  reads = 0;
  return import("./data");
}

let data: DataModule;

beforeEach(async () => {
  data = await loadData();
});

describe("getProjects", () => {
  it("unwraps the artifact envelope", async () => {
    expect(data.getProjects().map((p) => p.id)).toEqual([
      "ro-a1",
      "ro-metro-m2",
      "bg-sofia-metro-m1",
      "bg-a1-trakia",
    ]);
  });

  it("reads and parses each artifact only once", async () => {
    // getProject() used to re-read and re-parse the whole 350 KB file to find
    // one project, across 24 call sites and every page of a static build.
    data.getProjects();
    data.getProjects();
    data.getProject("ro-a1");
    data.getCountries();
    expect(reads).toBe(1);
  });
});

describe("getCityProjects", () => {
  it("returns only that city's projects", () => {
    expect(data.getCityProjects("bg-sofia").map((p) => p.id)).toEqual([
      "bg-sofia-metro-m1",
    ]);
  });

  it("returns nothing for a city with no projects", () => {
    expect(data.getCityProjects("ro-cluj")).toEqual([]);
  });
});

describe("getCityKeys", () => {
  it("lists cities that actually have projects, sorted", () => {
    expect(data.getCityKeys()).toEqual(["bg-sofia", "ro-bucharest"]);
  });
});

describe("getCountries", () => {
  it("deduplicates and sorts", () => {
    expect(data.getCountries()).toEqual(["bg", "ro"]);
  });

  it("counts countries that only have city projects", () => {
    // A country whose every project is city-scoped still exists.
    expect(data.getCountries()).toContain("bg");
  });
});

describe("getProject", () => {
  it("finds by id", () => {
    expect(data.getProject("ro-metro-m2")?.name.en).toBe("M2");
  });

  it("returns undefined for an unknown id", () => {
    expect(data.getProject("xx-nope")).toBeUndefined();
  });
});
