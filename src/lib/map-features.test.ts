import { describe, it, expect } from "vitest";
import { lotFeatureProperties } from "./map-features";
import { countsTowardNetwork } from "./schema";
import type { Lot, Project } from "./schema";

/**
 * What the build is obliged to put on a feature.
 *
 * The map reads these back through an `as unknown as` cast, so the type
 * alone cannot catch an omission: a property the build never writes is
 * simply `undefined` at runtime, and the client happily treats it as "not
 * set". That is how `partOf` came to be missing from every feature while
 * `sharedWith` was there, which let the change readout count the A1 and A8
 * tunnels on top of the sections containing them.
 */

function project(over: Partial<Project> = {}): Project {
  return {
    id: "ro-a1",
    country: "ro",
    category: "highway",
    name: { en: "A1 motorway" },
    description: { en: "" },
    lots: [],
    sources: [{ title: "S", url: "https://example.com" }],
    ...over,
  } as Project;
}

function lot(over: Partial<Lot> = {}): Lot {
  return {
    id: "sebes-turda",
    name: { en: "Sebeș–Turda" },
    status: "opened",
    dates: { opened: "2020-12" },
    lengthKm: 17.1,
    geometryRef: "sebes-turda",
    ...over,
  } as Lot;
}

describe("lotFeatureProperties", () => {
  it("carries the identity and geometry-independent facts the map paints on", () => {
    const props = lotFeatureProperties(project(), lot());
    expect(props).toMatchObject({
      lotId: "sebes-turda",
      projectId: "ro-a1",
      projectName: "A1 motorway",
      lotName: "Sebeș–Turda",
      country: "ro",
      category: "highway",
      status: "opened",
      lengthKm: 17.1,
    });
    // 2020-12 is year*12 + (month-1).
    expect(props.openedMonth).toBe(2020 * 12 + 11);
    expect(props.opened).toBe(2020);
  });

  it("omits the optional keys rather than writing undefined", () => {
    const props = lotFeatureProperties(project(), lot());
    expect("city" in props).toBe(false);
    expect("sharedWith" in props).toBe(false);
    expect("partOf" in props).toBe(false);
    expect("marker" in props).toBe(false);
  });

  it("emits city only for a city-scoped project", () => {
    const props = lotFeatureProperties(
      project({ city: "ro-bucharest" }),
      lot(),
    );
    expect(props.city).toBe("ro-bucharest");
  });

  /**
   * The one that shipped wrong. Both exclusion markers have to reach the
   * feature, because a total computed from the GeoJSON has no other way to
   * learn them, and `countsTowardNetwork` reads exactly these two fields.
   */
  it.each([
    ["sharedWith", { sharedWith: "ro-metro-m1" }],
    ["partOf", { partOf: "ro-a1" }],
  ])("carries %s, so a client-side total can exclude the lot", (_name, marker) => {
    const props = lotFeatureProperties(
      project({ id: "ro-tunnels" }),
      lot(marker),
    );
    expect(props).toMatchObject(marker);
    expect(countsTowardNetwork(props)).toBe(false);
  });

  it("lets an ordinary lot count", () => {
    expect(countsTowardNetwork(lotFeatureProperties(project(), lot()))).toBe(
      true,
    );
  });

  it("marks an expected opening that came from the contract, not a source", () => {
    const derived = lotFeatureProperties(
      project(),
      lot({
        status: "under_construction",
        dates: { constructionStart: "2023-01" },
        contract: { totalMonths: 24 },
      }),
    );
    expect(derived.expectedOpeningDerived).toBe(true);
    expect(derived.expectedOpeningMonth).not.toBeNull();

    const stated = lotFeatureProperties(
      project(),
      lot({
        status: "under_construction",
        dates: { constructionStart: "2023-01", expectedOpening: "2026-06" },
      }),
    );
    expect(stated.expectedOpeningDerived).toBe(false);
    expect(stated.expectedOpeningMonth).toBe(2026 * 12 + 5);
  });
});
