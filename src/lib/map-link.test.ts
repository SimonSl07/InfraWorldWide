import { describe, it, expect } from "vitest";
import { isOnMainMap, mapLotHref } from "./map-link";
import { parseLotRef, resolveLotRef } from "./map-filters";
import type { Lot, Project } from "./schema";

const lot = (over: Partial<Lot> = {}): Lot => ({
  id: "lot-1",
  name: { en: "Lot 1" },
  status: "opened",
  lengthKm: 10,
  geometryRef: "lot-1",
  dates: { opened: "2020" },
  ...over,
});

const project = (over: Partial<Project> = {}): Project => ({
  id: "ro-a1",
  country: "ro",
  category: "highway",
  name: { en: "A1" },
  description: { en: "" },
  sources: [{ title: "s", url: "https://example.org" }],
  lots: [lot()],
  ...over,
});

describe("mapLotHref", () => {
  it("uses the ?sel= parameter the map restores from", () => {
    expect(
      mapLotHref({ projectId: "ro-a2", lotId: "bucharest-fetesti" }),
    ).toBe("/map?sel=ro-a2.bucharest-fetesti");
  });

  it("escapes anything that would break the query string", () => {
    expect(mapLotHref({ projectId: "ro-a1", lotId: "a b&c" })).toBe(
      "/map?sel=ro-a1.a%20b%26c",
    );
  });

  /**
   * The link and the map's parser are two halves of one format, and they
   * were written in different changes: the parser learned to refuse an
   * ambiguous bare id while the link kept emitting one. Three real projects
   * share the lot id "main-bridge", so those three "show on map" links
   * resolved to nothing at all.
   */
  it("round-trips through the map's own parser, even for a shared lot id", () => {
    const candidates = [
      { projectId: "ro-braila-bridge", lotId: "main-bridge" },
      { projectId: "ro-giurgiu-ruse-bridge", lotId: "main-bridge" },
      { projectId: "ro-new-europe-bridge", lotId: "main-bridge" },
    ];

    for (const wanted of candidates) {
      const sel = new URL(
        mapLotHref(wanted),
        "https://example.org",
      ).searchParams.get("sel");
      expect(resolveLotRef(candidates, parseLotRef(sel))).toEqual(wanted);
    }
  });
});

describe("isOnMainMap", () => {
  it("accepts a lot the map draws", () => {
    expect(isOnMainMap(project(), lot())).toBe(true);
  });

  it("rejects every lot of a city project", () => {
    // A project with a city key is written to the city's own geometry file,
    // so ?sel= would find nothing and the link would open a blank map.
    expect(isOnMainMap(project({ city: "ro-bucharest" }), lot())).toBe(false);
  });

  it("rejects a cancelled lot, which no layer renders", () => {
    expect(isOnMainMap(project(), lot({ status: "cancelled" }))).toBe(false);
  });

  it("accepts lots that have not been built yet", () => {
    expect(isOnMainMap(project(), lot({ status: "planned" }))).toBe(true);
    expect(isOnMainMap(project(), lot({ status: "tendered" }))).toBe(true);
  });
});
