import { describe, it, expect } from "vitest";
import {
  MIN_RANKED_LOTS,
  buildContractorDirectory,
  findContractorProfile,
  unregisteredFirms,
} from "./contractor-directory";
import { collectLotMetrics, rankByContractor } from "./rankings";
import { createContractorResolver } from "./contractors";
import { createDeflator } from "./deflator";
import { monthIndex } from "./contract";
import type { ContractorRegistry, DeflatorTable, Project } from "./schema";

const deflators: DeflatorTable = {
  baseYear: 2015,
  note: "test",
  sources: [{ title: "t", url: "https://example.org" }],
  series: {
    EUR: {
      geo: "EA",
      label: { en: "Euro area" },
      index: { "2015": 100, "2021": 100 },
    },
  },
};

const registry: ContractorRegistry = {
  note: "test",
  contractors: [
    { id: "astaldi", name: "Astaldi", aliases: ["Astaldi SpA"] },
    { id: "max-bogl", name: "Max Bögl" },
    {
      id: "astaldi-max-bogl",
      name: "Astaldi – Max Bögl",
      members: ["astaldi", "max-bogl"],
    },
  ],
};

/**
 * ro-a1  lot-1  Astaldi SpA (builder), Search Corporation (designer)
 *        lot-2  Astaldi – Max Bögl, the registered joint venture
 * bg-x   lot-3  Astaldi, so the firm has built in two countries
 *        lot-4  Search Corporation as designer only, and nothing else
 */
const projects: Project[] = [
  {
    id: "ro-a1",
    country: "ro",
    category: "highway",
    name: { en: "A1" },
    description: { en: "" },
    sources: [{ title: "s", url: "https://example.org" }],
    lots: [
      {
        id: "lot-1",
        name: { en: "Lot 1" },
        status: "opened",
        lengthKm: 20,
        geometryRef: "lot-1",
        dates: { constructionStart: "2018-01", opened: "2021-01" },
        contract: { executionMonths: 24 },
        contractors: [
          { name: "Astaldi SpA", role: "builder" },
          { name: "Search Corporation", role: "designer" },
        ],
      },
      {
        id: "lot-2",
        name: { en: "Lot 2" },
        status: "opened",
        lengthKm: 10,
        geometryRef: "lot-2",
        dates: { constructionStart: "2019-01", opened: "2021-01" },
        contract: { executionMonths: 24 },
        contractors: [{ name: "Astaldi – Max Bögl", role: "builder" }],
      },
    ],
  },
  {
    id: "bg-x",
    country: "bg",
    category: "highway",
    name: { en: "X" },
    description: { en: "" },
    sources: [{ title: "s", url: "https://example.org" }],
    lots: [
      {
        id: "lot-3",
        name: { en: "Lot 3" },
        status: "opened",
        lengthKm: 5,
        geometryRef: "lot-3",
        dates: { opened: "2020-01" },
        contractors: [{ name: "Astaldi" }],
      },
      {
        id: "tunnel-inside-lot-1",
        name: { en: "Tunnel inside lot 1" },
        status: "opened",
        lengthKm: 3,
        geometryRef: "tunnel-inside-lot-1",
        dates: { opened: "2021-01" },
        // Its works are already measured by ro-a1/lot-1.
        partOf: "ro-a1",
        contractors: [{ name: "Astaldi SpA", role: "builder" }],
      },
      {
        id: "lot-4",
        name: { en: "Lot 4" },
        status: "opened",
        lengthKm: 7,
        geometryRef: "lot-4",
        dates: { opened: "2020-01" },
        contractors: [{ name: "Search Corporation", role: "designer" }],
      },
    ],
  },
];

const options = {
  registry,
  deflate: createDeflator(deflators),
  priceYear: 2021,
  resolve: createContractorResolver(registry),
  nowMonth: monthIndex("2026-08")!,
};

const profiles = buildContractorDirectory(projects, options);
const astaldi = findContractorProfile(profiles, "astaldi")!;
const search = findContractorProfile(profiles, "search-corporation")!;

describe("buildContractorDirectory", () => {
  it("returns firms only, never the joint venture entity", () => {
    // A joint venture's work is already credited to each member, so ranking
    // the pairing beside them would count the same lot twice.
    expect(profiles.map((p) => p.id).sort()).toEqual([
      "astaldi",
      "max-bogl",
      "search-corporation",
    ]);
    expect(profiles.every((p) => p.kind === "firm")).toBe(true);
  });

  it("credits a firm for the lots it built, through a JV or directly", () => {
    expect(astaldi.built.map((m) => m.lotId).sort()).toEqual([
      "lot-1",
      "lot-2",
      "lot-3",
      "tunnel-inside-lot-1",
    ]);
    expect(findContractorProfile(profiles, "max-bogl")!.built.map((m) => m.lotId))
      .toEqual(["lot-2"]);
  });

  it("names the joint ventures a firm was credited through", () => {
    expect(astaldi.jointVentures).toEqual(["Astaldi – Max Bögl"]);
    // Nothing to say for a firm that never worked in one.
    expect(search.jointVentures).toEqual([]);
  });

  it("keeps design credits out of the built list and reports them apart", () => {
    // DEFAULT_ROLES in contractors.ts excludes designers from the rankings,
    // so a page that showed one combined count would quietly mean something
    // else than the league beside it.
    expect(search.built).toEqual([]);
    expect(search.otherRoles.map((c) => [c.metric.lotId, c.role])).toEqual([
      ["lot-1", "designer"],
      ["lot-4", "designer"],
    ]);
  });

  it("treats an unlabelled contractor as a builder", () => {
    // lot-3 lists Astaldi with no role at all.
    expect(astaldi.built.some((m) => m.lotId === "lot-3")).toBe(true);
  });

  it("lists every country the firm is credited in", () => {
    expect(astaldi.countries).toEqual(["bg", "ro"]);
    expect(search.countries).toEqual(["bg", "ro"]);
  });

  it("does not count a lot whose works another project already measures", () => {
    // The firm built the tunnel, so it belongs in its section list. Its
    // kilometres do not, because ro-a1/lot-1 already measures them. The
    // league on /rankings applies this rule, and the contractors page prints
    // both figures side by side, so disagreeing here is visible on screen.
    expect(astaldi.built.map((m) => m.lotId)).toContain("tunnel-inside-lot-1");
    expect(astaldi.km).toBe(35);
  });

  it("sums the length of the built lots only", () => {
    expect(astaldi.km).toBe(35);
    expect(search.km).toBe(0);
  });

  it("carries the same delivery record rankByContractor reports", () => {
    const group = rankByContractor(
      collectLotMetrics(projects, options),
    ).find((g) => g.key === "astaldi")!;
    expect(astaldi.ranking).toEqual(group);
    // Not `built.length`: the league counts the lots that count toward the
    // network, and this firm also built a tunnel inside a section another
    // project already measures. It is listed as built and excluded from the
    // ranked total, which is the same rule the km figure applies.
    expect(astaldi.ranking!.lots).toBe(
      astaldi.built.filter((m) => !m.partOf && !m.sharedWith).length,
    );
  });

  it("has no delivery record for a firm that only designed", () => {
    expect(search.ranking).toBeNull();
  });

  it("marks a firm with too few sections as unranked", () => {
    expect(MIN_RANKED_LOTS).toBe(2);
    expect(astaldi.ranked).toBe(true);
    // One section is an anecdote, not a track record.
    expect(findContractorProfile(profiles, "max-bogl")!.ranked).toBe(false);
    expect(search.ranked).toBe(false);
  });

  it("says whether the identity came from the registry or from a name", () => {
    expect(astaldi.registered).toBe(true);
    // "Search Corporation" is in no registry entry, so the resolver minted an
    // id from the spelling: another spelling would rank as a second firm.
    expect(search.registered).toBe(false);
  });

  it("orders by built sections, then length, then name", () => {
    expect(profiles.map((p) => p.id)).toEqual([
      "astaldi",
      "max-bogl",
      "search-corporation",
    ]);
  });

  it("counts a firm once for a lot that names it twice", () => {
    const twice: Project[] = [
      {
        ...projects[0],
        lots: [
          {
            ...projects[0].lots[1],
            contractors: [
              { name: "Astaldi – Max Bögl", role: "builder" },
              { name: "Astaldi", role: "builder" },
            ],
          },
        ],
      },
    ];
    const only = buildContractorDirectory(twice, options);
    expect(findContractorProfile(only, "astaldi")!.built).toHaveLength(1);
  });

  it("returns nothing for projects with no contractors at all", () => {
    expect(buildContractorDirectory([], options)).toEqual([]);
  });
});

describe("unregisteredFirms", () => {
  it("returns the firms that resolve to no registry entry", () => {
    expect(unregisteredFirms(profiles).map((p) => p.id)).toEqual([
      "search-corporation",
    ]);
  });
});

describe("findContractorProfile", () => {
  it("returns null for an unknown id", () => {
    expect(findContractorProfile(profiles, "nope")).toBeNull();
  });
});
