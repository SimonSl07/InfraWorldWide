import { describe, it, expect } from "vitest";
import {
  buildYearFilters,
  shouldShowFuture,
  computeMinYear,
  computeMaxYear,
  HARD_MIN_YEAR,
  parseYearParam,
  parseCategoriesParam,
  serializeMapParams,
} from "./map-filters";

describe("buildYearFilters", () => {
  const cats = new Set(["highway", "railway"] as const);
  const NOW = 2026;
  const filters = buildYearFilters(2010, cats, NOW);

  it("produces opened/underConstruction/future filters", () => {
    expect(filters.opened).toBeDefined();
    expect(filters.underConstruction).toBeDefined();
    expect(filters.future).toBeDefined();
  });

  it("restricts every filter to the given categories", () => {
    const json = JSON.stringify(filters);
    expect(json).toContain('"highway","railway"');
  });

  it("opened filter requires opened <= year", () => {
    expect(JSON.stringify(filters.opened)).toBe(
      JSON.stringify([
        "all",
        ["in", ["get", "category"], ["literal", ["highway", "railway"]]],
        ["all", ["!=", ["get", "opened"], null], ["<=", ["get", "opened"], 2010]],
      ]),
    );
  });

  it("under-construction filter excludes lots effectively opened by that year", () => {
    const ucJson = JSON.stringify(filters.underConstruction);
    expect(ucJson).toContain('["<=",["get","constructionStart"],2010]');
    // negation of the opened condition
    expect(ucJson).toContain('"!"');
    expect(ucJson).toContain('["<=",["get","opened"],2010]');
  });

  it("future filter excludes lots already started by that year", () => {
    const json = JSON.stringify(filters.future);
    expect(json).toContain('[">",["get","constructionStart"],2010]');
  });

  it("ignores expectedOpening for past/present years", () => {
    expect(JSON.stringify(buildYearFilters(2026, cats, NOW))).not.toContain(
      "expectedOpening",
    );
    expect(JSON.stringify(buildYearFilters(2010, cats, NOW))).not.toContain(
      "expectedOpening",
    );
  });

  it("treats expectedOpening as opened for future years", () => {
    const f = buildYearFilters(2030, cats, NOW);
    const openedJson = JSON.stringify(f.opened);
    // opened = real opening <= 2030 OR expected opening <= 2030
    expect(openedJson).toContain('"expectedOpening"');
    expect(openedJson).toContain('["<=",["get","expectedOpening"],2030]');
    // UC must NOT include lots whose expected opening has passed
    const ucJson = JSON.stringify(f.underConstruction);
    expect(ucJson).toContain('"expectedOpening"');
    // future (planned) layer must also exclude effectively-opened lots
    expect(JSON.stringify(f.future)).toContain('"expectedOpening"');
  });

  it("does not treat expectedOpening as opened before it passes", () => {
    const f = buildYearFilters(2028, cats, NOW);
    const openedJson = JSON.stringify(f.opened);
    expect(openedJson).toContain('["<=",["get","expectedOpening"],2028]');
    // not <= 2030
    expect(openedJson).not.toContain('["<=",["get","expectedOpening"],2030]');
  });
});

describe("computeMaxYear", () => {
  it("is nowYear + 5 without expected openings", () => {
    expect(computeMaxYear([], 2026)).toBe(2031);
    expect(computeMaxYear([{ properties: { opened: 2020 } }], 2026)).toBe(2031);
  });
  it("extends to the latest expected opening", () => {
    const features = [{ properties: { expectedOpening: 2035 } }];
    expect(computeMaxYear(features, 2026)).toBe(2035);
  });
  it("ignores expected openings closer than nowYear + 5", () => {
    const features = [{ properties: { expectedOpening: 2028 } }];
    expect(computeMaxYear(features, 2026)).toBe(2031);
  });
});

describe("computeMinYear", () => {
  it("is 5 years before the earliest feature date", () => {
    const features = [
      { properties: { opened: 1895, constructionStart: null } },
      { properties: { opened: 2012, constructionStart: 2009 } },
    ];
    expect(computeMinYear(features)).toBe(1890);
  });
  it("prefers the earliest of opened/constructionStart", () => {
    const features = [{ properties: { opened: 1972, constructionStart: 1968 } }];
    expect(computeMinYear(features)).toBe(1963);
  });
  it("defaults to 1970 when there are no dates", () => {
    expect(computeMinYear([{ properties: { opened: null } }])).toBe(1970);
    expect(computeMinYear([])).toBe(1970);
  });
  it("never exceeds 1970 and never goes below the hard floor", () => {
    expect(computeMinYear([{ properties: { opened: 1990 } }])).toBe(1970);
    expect(computeMinYear([{ properties: { opened: HARD_MIN_YEAR } }])).toBe(
      HARD_MIN_YEAR,
    );
  });
});

describe("parseYearParam", () => {
  it("parses a valid year", () => {
    expect(parseYearParam("2010", 1970, 2031, 2026)).toBe(2010);
  });
  it("falls back on missing, non-numeric or out-of-range values", () => {
    expect(parseYearParam(null, 1970, 2031, 2026)).toBe(2026);
    expect(parseYearParam("abc", 1970, 2031, 2026)).toBe(2026);
    expect(parseYearParam("1950", 1970, 2031, 2026)).toBe(2026);
    expect(parseYearParam("2050", 1970, 2031, 2026)).toBe(2026);
    expect(parseYearParam("2010.5", 1970, 2031, 2026)).toBe(2026);
  });
});

describe("parseCategoriesParam", () => {
  it("parses a valid subset", () => {
    expect([...parseCategoriesParam("highway,bridge")].sort()).toEqual([
      "bridge",
      "highway",
    ]);
  });
  it("returns all categories for missing or fully-invalid params", () => {
    expect(parseCategoriesParam(null).size).toBe(4);
    expect(parseCategoriesParam("spaceship").size).toBe(4);
  });
  it("keeps valid categories when mixed with invalid ones", () => {
    expect([...parseCategoriesParam("highway,spaceship")]).toEqual(["highway"]);
  });
});

describe("serializeMapParams", () => {
  const allCats = new Set(["highway", "railway", "bridge", "tunnel"] as const);

  it("is empty at default state", () => {
    expect(serializeMapParams(2026, allCats, null, 2026)).toBe("");
  });
  it("includes year when not default", () => {
    expect(serializeMapParams(2005, allCats, null, 2026)).toBe("year=2005");
  });
  it("includes sorted categories when a subset is active", () => {
    const qs = serializeMapParams(
      2026,
      new Set(["railway", "highway"] as const),
      null,
      2026,
    );
    expect(qs).toBe("cat=highway%2Crailway");
  });
  it("includes selection", () => {
    expect(serializeMapParams(2026, allCats, "lot-1", 2026)).toBe("sel=lot-1");
  });
  it("includes the playback speed only when it differs from the default", () => {
    expect(serializeMapParams(2026, allCats, null, 2026, 1, 1)).toBe("");
    expect(serializeMapParams(2026, allCats, null, 2026, 4, 1)).toBe("speed=4");
  });
  it("omits speed when not provided", () => {
    expect(serializeMapParams(2026, allCats, null, 2026)).toBe("");
  });
  it("round-trips through the parsers", () => {
    const qs = serializeMapParams(2005, new Set(["bridge"] as const), null, 2026);
    const params = new URLSearchParams(qs);
    expect(parseYearParam(params.get("year"), 1970, 2031, 2026)).toBe(2005);
    expect([...parseCategoriesParam(params.get("cat"))]).toEqual(["bridge"]);
  });
});
