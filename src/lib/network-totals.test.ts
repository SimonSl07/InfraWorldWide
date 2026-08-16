import { describe, it, expect } from "vitest";
import { computeStats } from "./stats";
import { summarizeCountries } from "./country-stats";
import { openedKmByDecade } from "./country-growth";
import {
  collectLotMetrics,
  rankByContractor,
  rankByCountry,
  type MetricsOptions,
} from "./rankings";
import { buildContractorDirectory } from "./contractor-directory";
import { projectTotals } from "./project-summary";
import { openedBetween } from "./map-delta";
import { cityMarkerProperties, lotFeatureProperties } from "./map-features";
import { createDeflator } from "./deflator";
import { createContractorResolver } from "./contractors";
import { countsTowardNetwork } from "./schema";
import type {
  City,
  ContractorRegistry,
  DeflatorTable,
  Project,
} from "./schema";

const deflators: DeflatorTable = {
  baseYear: 2015,
  note: "test",
  sources: [{ title: "t", url: "https://example.org" }],
  series: {
    EUR: { geo: "EA", label: { en: "Euro area" }, index: { "2015": 100 } },
  },
};

const registry: ContractorRegistry = {
  note: "test",
  contractors: [],
};

/** Same options every metric-based aggregate is built with. */
function metricsOptions(): MetricsOptions {
  return {
    deflate: createDeflator(deflators),
    priceYear: 2015,
    resolve: createContractorResolver(registry),
    nowMonth: 2026 * 12,
  };
}

function metrics() {
  return collectLotMetrics(fixture(), metricsOptions());
}

/**
 * One rule, checked once per aggregate that spans projects.
 *
 * This class of bug has now appeared twice: the homepage overstated the
 * network by 38.11 km because `computeStats` never filtered shared track,
 * and again by 23.27 km when `partOf` arrived and nothing read it. Both
 * times the rule existed and one aggregate had not been told.
 *
 * So this file is deliberately not organised by module. It states the rule,
 * and every function that sums across projects answers to it here.
 */

const REAL_KM = 100;
const SHARED_KM = 8.67;
const PART_KM = 6.7;

/**
 * One country, one real section, plus the two kinds of lot whose kilometres
 * another project already counts.
 */
function fixture(): Project[] {
  return [
    {
      id: "ro-a1",
      country: "ro",
      category: "highway",
      name: { en: "A1" },
      description: { en: "" },
      lots: [
        {
          id: "real",
          name: { en: "Real" },
          status: "opened",
          dates: { opened: "2015" },
          lengthKm: REAL_KM,
          geometryRef: "real",
          contractors: [{ name: "Builder Ltd", role: "builder" }],
        },
      ],
      sources: [{ title: "S", url: "https://example.com" }],
    },
    {
      id: "ro-metro-m3",
      country: "ro",
      category: "railway",
      name: { en: "M3" },
      description: { en: "" },
      lots: [
        {
          id: "borrowed",
          name: { en: "Borrowed" },
          status: "opened",
          dates: { opened: "2015" },
          lengthKm: SHARED_KM,
          geometryRef: "borrowed",
          contractors: [{ name: "Builder Ltd", role: "builder" }],
          // Track another line owns and already counts.
          sharedWith: "ro-metro-m1",
        },
      ],
      sources: [{ title: "S", url: "https://example.com" }],
    },
    {
      id: "ro-tunnels",
      country: "ro",
      category: "tunnel",
      name: { en: "Tunnels" },
      description: { en: "" },
      lots: [
        {
          id: "inside",
          name: { en: "Inside" },
          status: "opened",
          dates: { opened: "2015" },
          lengthKm: PART_KM,
          geometryRef: "inside",
          contractors: [{ name: "Builder Ltd", role: "builder" }],
          // A structure sitting inside a section its parent already measures.
          partOf: "ro-a1",
        },
      ],
      sources: [{ title: "S", url: "https://example.com" }],
    },
  ] as Project[];
}

describe("countsTowardNetwork", () => {
  it("rejects both kinds of already-counted lot, and nothing else", () => {
    expect(countsTowardNetwork({})).toBe(true);
    expect(countsTowardNetwork({ sharedWith: "ro-metro-m1" })).toBe(false);
    expect(countsTowardNetwork({ partOf: "ro-a1" })).toBe(false);
  });
});

describe("every total that spans projects applies it", () => {
  const projects = fixture();

  it("computeStats: the headline network figure", () => {
    expect(computeStats(projects, 2026, 20).openedKm).toBe(REAL_KM);
  });

  it("summarizeCountries: the per-country totals behind the map panel", () => {
    // Month index 2026-01, well after the fixture openings in 2015.
    const nowMonth = 2026 * 12;
    const [country] = summarizeCountries(projects, nowMonth, nowMonth);
    expect(country.total.openedKm).toBe(REAL_KM);
  });

  it("openedKmByDecade: the growth chart", () => {
    const total = openedKmByDecade(projects, "ro").reduce(
      (sum, bucket) => sum + bucket.km,
      0,
    );
    expect(total).toBe(REAL_KM);
  });

  it("rankByCountry: the per-country league", () => {
    const [group] = rankByCountry(metrics());
    expect(group.km).toBe(REAL_KM);
  });

  it("rankByContractor: the per-firm league", () => {
    // Every fixture lot lists the same builder, so a firm credited with all
    // three must still only carry the one that counts.
    const [group] = rankByContractor(metrics());
    expect(group.km).toBe(REAL_KM);
  });

  /**
   * The map's change readout is the one aggregate that does not run on
   * `Project`: MapLibre cannot reach into projects.json, so it sums the
   * flattened feature properties instead. That is exactly how it came to
   * apply `sharedWith` and not `partOf` — the build emitted only the first,
   * so the rule could not be applied even in principle.
   *
   * Which is why the features here come from `lotFeatureProperties` rather
   * than being written out by hand. Hand-written ones would carry both
   * markers whatever the build does, and this test would keep passing
   * through a repeat of the original bug.
   */
  it("openedBetween: the map's before/after readout", () => {
    const features = fixture().flatMap((p) =>
      p.lots.map((lot) => lotFeatureProperties(p, lot)),
    );
    const delta = openedBetween(features, {
      from: 2010 * 12,
      to: 2026 * 12,
      nowMonth: 2026 * 12,
    });
    expect(delta.km).toBe(REAL_KM);
    // All three are real openings and stay in the list; only the total drops
    // the two, and says out loud how much it dropped.
    expect(delta.count).toBe(3);
    // Rounded to one decimal, as every kilometre figure on the panel is.
    expect(delta.alsoCountedKm).toBeCloseTo(SHARED_KM + PART_KM, 1);
  });

  /**
   * The city marker's `km` is the other total the data build computes, and
   * for a long time the only one with no case here: it lived as an inline
   * expression at the script's module scope, where nothing could import it.
   */
  it("cityMarkerProperties: the km on a city's map marker", () => {
    const projects = fixture().map((p) => ({ ...p, city: "ro-bucharest" }));
    const marker = cityMarkerProperties(
      "ro-bucharest",
      {
        country: "ro",
        name: { en: "Bucharest" },
        center: [26.1, 44.43],
      } as City,
      projects,
      null,
    );
    expect(marker.km).toBe(REAL_KM);
    // The lot count is not a network total: it says how many rows the city
    // page lists, and it lists all of them.
    expect(marker.lots).toBe(3);
  });

  it("buildContractorDirectory: the contractor profile pages", () => {
    // This one shipped wrong: the profile summed every built lot while the
    // league beside it on the same page filtered, so the two disagreed.
    const [profile] = buildContractorDirectory(fixture(), {
      ...metricsOptions(),
      registry,
    });
    expect(profile.km).toBe(REAL_KM);
  });

  /**
   * The counterpart, and the reason this cannot simply filter everywhere: a
   * project's own page reports its own lots in full. That is how operators
   * publish it, and why Sofia's four lines sum to more than the system they
   * run on. `projectTotals` is the function that has to get this right.
   */
  it("projectTotals: a project counts its own lots in full", () => {
    const shared = projectTotals(
      fixture().find((p) => p.id === "ro-metro-m3")!,
      2026 * 12,
    );
    expect(shared.totalKm).toBe(SHARED_KM);
    // ...while still saying out loud that someone else counts them too.
    expect(shared.alsoCountedElsewhereKm).toBe(SHARED_KM);

    const own = projectTotals(
      fixture().find((p) => p.id === "ro-a1")!,
      2026 * 12,
    );
    expect(own.totalKm).toBe(REAL_KM);
    expect(own.alsoCountedElsewhereKm).toBe(0);
  });
});
