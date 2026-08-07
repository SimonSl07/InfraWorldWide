import { describe, it, expect } from "vitest";
import {
  buildCategoryFilter,
  buildSelectionFilter,
  buildYearFilters,
  shouldShowFuture,
  computeMinYear,
  computeMaxYear,
  fullSelection,
  HARD_MIN_YEAR,
  isCategoryActive,
  isStatusActive,
  parseYearParam,
  parseCategoriesParam,
  parseSelectionParam,
  selectionCategories,
  serializeMapParams,
  setCategoryStatuses,
  toggleCategory,
  toggleStatus,
} from "./map-filters";

describe("buildYearFilters", () => {
  const cats = fullSelection(["highway", "railway"]);
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
    expect(json).not.toContain('"bridge"');
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

describe("shouldShowFuture", () => {
  it("hides not-yet-started lots when viewing the past", () => {
    expect(shouldShowFuture(2005, 2026)).toBe(false);
    expect(shouldShowFuture(2025, 2026)).toBe(false);
  });
  it("shows them at the present year and beyond", () => {
    expect(shouldShowFuture(2026, 2026)).toBe(true);
    expect(shouldShowFuture(2032, 2026)).toBe(true);
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
  const allCats = fullSelection();

  it("is empty at default state", () => {
    expect(serializeMapParams(2026, allCats, null, 2026)).toBe("");
  });
  it("includes year when not default", () => {
    expect(serializeMapParams(2005, allCats, null, 2026)).toBe("year=2005");
  });
  it("includes sorted categories when a subset is active", () => {
    const qs = serializeMapParams(
      2026,
      fullSelection(["railway", "highway"]),
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
    const qs = serializeMapParams(2005, fullSelection(["bridge"]), null, 2026);
    const params = new URLSearchParams(qs);
    expect(parseYearParam(params.get("year"), 1970, 2031, 2026)).toBe(2005);
    expect([...parseCategoriesParam(params.get("cat"))]).toEqual(["bridge"]);
  });
});

describe("category/status selection", () => {
  it("defaults to every category with every mapped status", () => {
    const sel = fullSelection();
    expect(sel.size).toBe(4);
    expect([...sel.get("railway")!].sort()).toEqual([
      "opened",
      "planned",
      "tendered",
      "under_construction",
    ]);
  });

  it("toggles a whole category off and back on with all statuses", () => {
    let sel = toggleCategory(fullSelection(), "railway");
    expect(isCategoryActive(sel, "railway")).toBe(false);
    expect(selectionCategories(sel).has("railway")).toBe(false);
    sel = toggleCategory(sel, "railway");
    expect(sel.get("railway")!.size).toBe(4);
  });

  it("toggles a single status without touching other categories", () => {
    const sel = toggleStatus(fullSelection(), "railway", "tendered");
    expect(isStatusActive(sel, "railway", "tendered")).toBe(false);
    expect(isStatusActive(sel, "railway", "opened")).toBe(true);
    expect(isStatusActive(sel, "highway", "tendered")).toBe(true);
  });

  it("switches the category off when its last status is removed", () => {
    let sel = fullSelection(["bridge"]);
    for (const s of ["opened", "under_construction", "tendered"] as const) {
      sel = toggleStatus(sel, "bridge", s);
    }
    expect(isCategoryActive(sel, "bridge")).toBe(true);
    sel = toggleStatus(sel, "bridge", "planned");
    expect(isCategoryActive(sel, "bridge")).toBe(false);
  });

  it("does not mutate the selection it is given", () => {
    const sel = fullSelection();
    toggleStatus(sel, "railway", "tendered");
    toggleCategory(sel, "railway");
    expect(sel.get("railway")!.size).toBe(4);
  });

  it("sets or clears every status of a category at once", () => {
    const cleared = setCategoryStatuses(fullSelection(), "tunnel", []);
    expect(isCategoryActive(cleared, "tunnel")).toBe(false);
    const only = setCategoryStatuses(cleared, "tunnel", ["opened"]);
    expect([...only.get("tunnel")!]).toEqual(["opened"]);
  });
});

describe("buildSelectionFilter", () => {
  it("uses a plain category check when all statuses are shown", () => {
    expect(JSON.stringify(buildSelectionFilter(fullSelection(["highway"])))).toBe(
      JSON.stringify(["any", ["==", ["get", "category"], "highway"]]),
    );
  });

  it("adds a status check only for the narrowed category", () => {
    const sel = toggleStatus(fullSelection(["highway", "railway"]), "railway", "tendered");
    const json = JSON.stringify(buildSelectionFilter(sel));
    expect(json).toContain('["==",["get","category"],"highway"]');
    expect(json).toContain(
      '["in",["get","status"],["literal",["opened","under_construction","planned"]]]',
    );
    expect(json).not.toContain("tendered");
  });

  it("lists the categories still showing a given status", () => {
    const sel = toggleStatus(fullSelection(), "railway", "under_construction");
    expect(JSON.stringify(buildCategoryFilter(sel, "under_construction"))).toBe(
      JSON.stringify([
        "in",
        ["get", "category"],
        ["literal", ["highway", "bridge", "tunnel"]],
      ]),
    );
    expect(JSON.stringify(buildCategoryFilter(sel, "opened"))).toContain('"railway"');
  });

  it("matches nothing when every category is hidden", () => {
    const empty = buildSelectionFilter(new Map());
    expect(JSON.stringify(empty)).toBe(
      JSON.stringify(["in", ["get", "category"], ["literal", []]]),
    );
  });

  it("only the not-yet-started layer matches on declared status", () => {
    const sel = toggleStatus(fullSelection(["railway"]), "railway", "tendered");
    const f = buildYearFilters(2026, sel, 2026);
    expect(JSON.stringify(f.future)).toContain('["get","status"]');
    expect(JSON.stringify(f.opened)).not.toContain('["get","status"]');
    expect(JSON.stringify(f.underConstruction)).not.toContain('["get","status"]');
  });
});

describe("parseSelectionParam", () => {
  it("gives every category all statuses without params", () => {
    const sel = parseSelectionParam(null, null);
    expect(sel.size).toBe(4);
    expect(sel.get("bridge")!.size).toBe(4);
  });

  it("narrows one category's statuses", () => {
    const sel = parseSelectionParam(null, "railway:opened.planned");
    expect([...sel.get("railway")!]).toEqual(["opened", "planned"]);
    expect(sel.get("highway")!.size).toBe(4);
  });

  it("ignores entries for categories that are hidden anyway", () => {
    const sel = parseSelectionParam("highway", "railway:opened");
    expect(sel.has("railway")).toBe(false);
    expect(sel.get("highway")!.size).toBe(4);
  });

  it("ignores unknown categories, unknown statuses and empty lists", () => {
    expect(parseSelectionParam(null, "spaceship:opened").size).toBe(4);
    const sel = parseSelectionParam(null, "railway:warp_drive.opened");
    expect([...sel.get("railway")!]).toEqual(["opened"]);
    expect(parseSelectionParam(null, "railway:warp_drive").get("railway")!.size).toBe(4);
    expect(parseSelectionParam(null, "railway:").get("railway")!.size).toBe(4);
  });
});

describe("serializeMapParams with status subsets", () => {
  it("omits ?st= when every category shows every status", () => {
    expect(serializeMapParams(2026, fullSelection(), null, 2026)).toBe("");
  });

  it("writes only the narrowed categories, in MAP_STATUSES order", () => {
    const sel = toggleStatus(fullSelection(), "railway", "tendered");
    const params = new URLSearchParams(serializeMapParams(2026, sel, null, 2026));
    expect(params.get("cat")).toBe(null);
    expect(params.get("st")).toBe("railway:opened.under_construction.planned");
  });

  it("round-trips a mixed selection", () => {
    const sel = toggleStatus(
      toggleCategory(fullSelection(), "tunnel"),
      "railway",
      "tendered",
    );
    const params = new URLSearchParams(
      serializeMapParams(2005, sel, "lot-1", 2026),
    );
    const back = parseSelectionParam(params.get("cat"), params.get("st"));
    expect(selectionCategories(back)).toEqual(selectionCategories(sel));
    expect([...back.get("railway")!]).toEqual([...sel.get("railway")!]);
    expect(back.has("tunnel")).toBe(false);
  });
});

describe("status is evaluated at the viewed year", () => {
  const NOW = 2026;

  it("unticking 'opened' hides the opened layer but keeps building sites", () => {
    const sel = toggleStatus(fullSelection(["highway"]), "highway", "opened");
    const f = buildYearFilters(2010, sel, NOW);
    // opened layer: no categories left to draw
    expect(JSON.stringify(f.opened)).toContain('["literal",[]]');
    // under-construction layer: highways still drawn
    expect(JSON.stringify(f.underConstruction)).toContain('["literal",["highway"]]');
  });

  it("unticking 'under construction' hides only building sites", () => {
    const sel = toggleStatus(fullSelection(["railway"]), "railway", "under_construction");
    const f = buildYearFilters(2010, sel, NOW);
    expect(JSON.stringify(f.opened)).toContain('["literal",["railway"]]');
    expect(JSON.stringify(f.underConstruction)).toContain('["literal",[]]');
  });

  it("judges a lot by the year, not by the status it carries today", () => {
    // A lot that is "opened" today is a building site in 2010; it is the
    // under-construction checkbox that governs it there, and the year layers
    // never look at the declared status at all.
    const sel = fullSelection(["highway"]);
    const f = buildYearFilters(2010, sel, NOW);
    expect(JSON.stringify(f.underConstruction)).not.toContain('["get","status"]');
    expect(JSON.stringify(f.underConstruction)).toContain(
      '["<=",["get","constructionStart"],2010]',
    );
  });

  it("keeps every layer empty when a category is switched off entirely", () => {
    const sel = toggleCategory(fullSelection(), "tunnel");
    const f = buildYearFilters(2026, sel, NOW);
    for (const filter of [f.opened, f.underConstruction, f.future]) {
      expect(JSON.stringify(filter)).not.toContain('"tunnel"');
    }
  });
});
