import { describe, it, expect } from "vitest";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import {
  buildCategoryFilter,
  buildSelectionFilter,
  buildMonthFilters,
  shouldShowFuture,
  computeMinMonth,
  computeMaxMonth,
  fullSelection,
  HARD_MIN_MONTH,
  isCategoryActive,
  isStatusActive,
  formatLotRef,
  formatViewParam,
  parseLotRef,
  resolveLotRef,
  parseMonthParam,
  parseCategoriesParam,
  parseCityParam,
  parseCompareParam,
  parseCountryParam,
  parseSelectionParam,
  parseViewParam,
  selectionCategories,
  serializeMapParams,
  setCategoryStatuses,
  toggleCategory,
  toggleStatus,
  toMonthIndex,
  fromMonthIndex,
  formatMonthParam,
} from "./map-filters";

describe("buildMonthFilters", () => {
  const cats = fullSelection(["highway", "railway"]);
  const NOW = toMonthIndex(2026, 8);
  const filters = buildMonthFilters(toMonthIndex(2010, 1), cats, NOW);

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

  it("opened filter requires openedMonth <= the viewed month", () => {
    expect(JSON.stringify(filters.opened)).toBe(
      JSON.stringify([
        "all",
        ["in", ["get", "category"], ["literal", ["highway", "railway"]]],
        [
          "all",
          ["!=", ["get", "openedMonth"], null],
          ["<=", ["get", "openedMonth"], toMonthIndex(2010, 1)],
        ],
      ]),
    );
  });

  it("under-construction filter excludes lots effectively opened by that month", () => {
    const ucJson = JSON.stringify(filters.underConstruction);
    expect(ucJson).toContain(
      `["<=",["get","constructionStartMonth"],${toMonthIndex(2010, 1)}]`,
    );
    // negation of the opened condition
    expect(ucJson).toContain('"!"');
    expect(ucJson).toContain(`["<=",["get","openedMonth"],${toMonthIndex(2010, 1)}]`);
  });

  it("future filter excludes lots already started by that month", () => {
    const json = JSON.stringify(filters.future);
    expect(json).toContain(
      `[">",["get","constructionStartMonth"],${toMonthIndex(2010, 1)}]`,
    );
  });

  it("advances a month at a time, not a year", () => {
    const july = toMonthIndex(2015, 7);
    const august = july + 1;
    expect(fromMonthIndex(august)).toEqual({ year: 2015, month: 8 });
    const jul = JSON.stringify(buildMonthFilters(july, cats, NOW).opened);
    const aug = JSON.stringify(buildMonthFilters(august, cats, NOW).opened);
    expect(jul).not.toBe(aug);
    expect(aug).toContain(`["<=",["get","openedMonth"],${august}]`);
  });

  it("ignores expectedOpening for past/present months", () => {
    expect(JSON.stringify(buildMonthFilters(NOW, cats, NOW))).not.toContain(
      "expectedOpeningMonth",
    );
    expect(
      JSON.stringify(buildMonthFilters(toMonthIndex(2010, 1), cats, NOW)),
    ).not.toContain("expectedOpeningMonth");
  });

  it("treats expectedOpening as opened for future months", () => {
    const future = toMonthIndex(2030, 3);
    const f = buildMonthFilters(future, cats, NOW);
    const openedJson = JSON.stringify(f.opened);
    expect(openedJson).toContain('"expectedOpeningMonth"');
    expect(openedJson).toContain(`["<=",["get","expectedOpeningMonth"],${future}]`);
    // UC must NOT include lots whose expected opening has passed
    expect(JSON.stringify(f.underConstruction)).toContain('"expectedOpeningMonth"');
    // future (planned) layer must also exclude effectively-opened lots
    expect(JSON.stringify(f.future)).toContain('"expectedOpeningMonth"');
  });

  it("does not treat expectedOpening as opened before it passes", () => {
    const earlier = toMonthIndex(2028, 5);
    const later = toMonthIndex(2030, 3);
    const openedJson = JSON.stringify(buildMonthFilters(earlier, cats, NOW).opened);
    expect(openedJson).toContain(`["<=",["get","expectedOpeningMonth"],${earlier}]`);
    expect(openedJson).not.toContain(`["<=",["get","expectedOpeningMonth"],${later}]`);
  });
});

/**
 * Lots old enough that no construction start could be sourced must simply
 * appear the month they opened — never as a "planned" road beforehand. 19 of
 * the lots in the data have `opened` and no `constructionStart`, so this is the
 * normal case for historic motorway sections, not an edge case.
 */
describe("a lot with an opening date but no construction start", () => {
  const cats = fullSelection();
  const NOW = toMonthIndex(2026, 8);
  const OPENED = toMonthIndex(1984, 1);
  const historic = {
    type: 2 as const,
    properties: {
      category: "highway",
      status: "opened",
      openedMonth: OPENED,
      constructionStartMonth: null,
    },
  };
  const matches = (spec: unknown, feature: unknown) =>
    featureFilter(spec as never).filter({ zoom: 6 } as never, feature as never);

  it("is on no layer at all before it opened", () => {
    const f = buildMonthFilters(toMonthIndex(1980, 1), cats, NOW);
    expect(matches(f.opened, historic)).toBe(false);
    expect(matches(f.underConstruction, historic)).toBe(false);
    expect(matches(f.future, historic)).toBe(false);
  });

  it("appears as opened from the month it opened", () => {
    for (const month of [OPENED, toMonthIndex(1990, 1), NOW]) {
      const f = buildMonthFilters(month, cats, NOW);
      expect(matches(f.opened, historic)).toBe(true);
      expect(matches(f.future, historic)).toBe(false);
    }
  });

  it("still shows a genuinely planned lot, which has neither date", () => {
    const planned = {
      type: 2 as const,
      properties: {
        category: "railway",
        status: "planned",
        openedMonth: null,
        constructionStartMonth: null,
      },
    };
    const f = buildMonthFilters(NOW, cats, NOW);
    expect(matches(f.future, planned)).toBe(true);
  });
});

describe("shouldShowFuture", () => {
  it("hides not-yet-started lots when viewing the past", () => {
    expect(shouldShowFuture(toMonthIndex(2005, 1), toMonthIndex(2026, 8))).toBe(false);
    expect(shouldShowFuture(toMonthIndex(2026, 7), toMonthIndex(2026, 8))).toBe(false);
  });
  it("shows them in the present month and beyond", () => {
    expect(shouldShowFuture(toMonthIndex(2026, 8), toMonthIndex(2026, 8))).toBe(true);
    expect(shouldShowFuture(toMonthIndex(2032, 1), toMonthIndex(2026, 8))).toBe(true);
  });
});

describe("computeMaxMonth", () => {
  const NOW = toMonthIndex(2026, 8);
  it("is five years out without expected openings", () => {
    expect(computeMaxMonth([], NOW)).toBe(toMonthIndex(2031, 8));
    expect(
      computeMaxMonth([{ properties: { openedMonth: toMonthIndex(2020, 3) } }], NOW),
    ).toBe(toMonthIndex(2031, 8));
  });
  it("extends to the latest expected opening", () => {
    const features = [{ properties: { expectedOpeningMonth: toMonthIndex(2035, 4) } }];
    expect(computeMaxMonth(features, NOW)).toBe(toMonthIndex(2035, 4));
  });
  it("ignores expected openings inside the five-year window", () => {
    const features = [{ properties: { expectedOpeningMonth: toMonthIndex(2028, 2) } }];
    expect(computeMaxMonth(features, NOW)).toBe(toMonthIndex(2031, 8));
  });
});

describe("computeMinMonth", () => {
  it("is five years before the earliest feature date", () => {
    const features = [
      { properties: { openedMonth: toMonthIndex(1895, 6), constructionStartMonth: null } },
      { properties: { openedMonth: toMonthIndex(2012, 7), constructionStartMonth: toMonthIndex(2009, 1) } },
    ];
    expect(computeMinMonth(features)).toBe(toMonthIndex(1890, 6));
  });
  it("prefers the earliest of opened/constructionStart", () => {
    const features = [
      { properties: { openedMonth: toMonthIndex(1972, 9), constructionStartMonth: toMonthIndex(1968, 4) } },
    ];
    expect(computeMinMonth(features)).toBe(toMonthIndex(1963, 4));
  });
  it("defaults to January 1970 when there are no dates", () => {
    expect(computeMinMonth([{ properties: { openedMonth: null } }])).toBe(toMonthIndex(1970));
    expect(computeMinMonth([])).toBe(toMonthIndex(1970));
  });
  it("never starts later than 1970 and never goes below the hard floor", () => {
    expect(computeMinMonth([{ properties: { openedMonth: toMonthIndex(1990, 1) } }])).toBe(
      toMonthIndex(1970),
    );
    expect(computeMinMonth([{ properties: { openedMonth: HARD_MIN_MONTH } }])).toBe(
      HARD_MIN_MONTH,
    );
  });
});

describe("parseMonthParam / formatMonthParam", () => {
  const MIN = toMonthIndex(1970), MAX = toMonthIndex(2031, 12), FB = toMonthIndex(2026, 8);
  it("parses YYYY-MM", () => {
    expect(parseMonthParam("2015-07", MIN, MAX, FB)).toBe(toMonthIndex(2015, 7));
    expect(parseMonthParam("2015-7", MIN, MAX, FB)).toBe(toMonthIndex(2015, 7));
  });
  it("accepts a bare year as that January", () => {
    expect(parseMonthParam("2010", MIN, MAX, FB)).toBe(toMonthIndex(2010, 1));
  });
  it("falls back on missing, malformed or out-of-range values", () => {
    expect(parseMonthParam(null, MIN, MAX, FB)).toBe(FB);
    expect(parseMonthParam("abc", MIN, MAX, FB)).toBe(FB);
    expect(parseMonthParam("1950-01", MIN, MAX, FB)).toBe(FB);
    expect(parseMonthParam("2050-01", MIN, MAX, FB)).toBe(FB);
    expect(parseMonthParam("2010-13", MIN, MAX, FB)).toBe(FB);
    expect(parseMonthParam("2010-00", MIN, MAX, FB)).toBe(FB);
  });
  it("round-trips through formatMonthParam", () => {
    for (const raw of ["2015-07", "1972-01", "2031-12"]) {
      expect(formatMonthParam(parseMonthParam(raw, MIN, MAX, FB))).toBe(raw);
    }
  });
  it("steps to the next month, not the next year", () => {
    const july = parseMonthParam("2015-07", MIN, MAX, FB);
    expect(formatMonthParam(july + 1)).toBe("2015-08");
    expect(fromMonthIndex(july + 6)).toEqual({ year: 2016, month: 1 });
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
  const NOW = toMonthIndex(2026, 8);

  it("is empty at default state", () => {
    expect(
      serializeMapParams({
        month: NOW,
        selection: allCats,
        defaultMonth: NOW,
      }),
    ).toBe("");
  });
  it("includes the month as YYYY-MM when not default", () => {
    expect(
      serializeMapParams({
        month: toMonthIndex(2005, 3),
        selection: allCats,
        defaultMonth: NOW,
      }),
    ).toBe("t=2005-03");
  });
  it("includes sorted categories when a subset is active", () => {
    const qs = serializeMapParams({
      month: NOW,
      selection: fullSelection(["railway", "highway"]),
      defaultMonth: NOW,
    });
    expect(qs).toBe("cat=highway%2Crailway");
  });
  it("includes selection", () => {
    expect(
      serializeMapParams({
        month: NOW,
        selection: allCats,
        selectedLot: { projectId: "ro-a1", lotId: "lot-1" },
        defaultMonth: NOW,
      }),
    ).toBe("sel=ro-a1.lot-1");
  });
  it("includes a selected country", () => {
    expect(
      serializeMapParams({
        month: NOW,
        selection: allCats,
        selectedCountry: "ro",
        defaultMonth: NOW,
      }),
    ).toBe("c=ro");
  });
  // The two selections share the panel, so they can never both be live —
  // writing both would produce a link that restores an impossible state.
  it("prefers the lot when a country is somehow also set", () => {
    expect(
      serializeMapParams({
        month: NOW,
        selection: allCats,
        selectedLot: { projectId: "ro-a1", lotId: "lot-1" },
        selectedCountry: "ro",
        defaultMonth: NOW,
      }),
    ).toBe("sel=ro-a1.lot-1");
  });
  it("includes the playback speed only when it differs from the default", () => {
    const base = { month: NOW, selection: allCats, defaultMonth: NOW };
    expect(
      serializeMapParams({ ...base, speedIndex: 1, defaultSpeedIndex: 1 }),
    ).toBe("");
    expect(
      serializeMapParams({ ...base, speedIndex: 4, defaultSpeedIndex: 1 }),
    ).toBe("speed=4");
  });
  it("omits speed when not provided", () => {
    expect(
      serializeMapParams({
        month: NOW,
        selection: allCats,
        defaultMonth: NOW,
      }),
    ).toBe("");
  });
  it("round-trips through the parsers", () => {
    const qs = serializeMapParams({
      month: toMonthIndex(2005, 3),
      selection: fullSelection(["bridge"]),
      selectedCountry: "bg",
      defaultMonth: NOW,
    });
    const params = new URLSearchParams(qs);
    expect(
      parseMonthParam(
        params.get("t"),
        toMonthIndex(1970),
        toMonthIndex(2031, 12),
        toMonthIndex(2026, 8),
      ),
    ).toBe(toMonthIndex(2005, 3));
    expect([...parseCategoriesParam(params.get("cat"))]).toEqual(["bridge"]);
    expect(parseCountryParam(params.get("c"))).toBe("bg");
  });
});

describe("parseCompareParam", () => {
  const known = ["ro", "bg", "rs"];

  it("keeps the order given in the link", () => {
    expect(parseCompareParam("rs,ro", known, 3)).toEqual(["rs", "ro"]);
  });

  it("is empty for a missing or blank param", () => {
    expect(parseCompareParam(null, known, 3)).toEqual([]);
    expect(parseCompareParam("", known, 3)).toEqual([]);
  });

  it("tolerates whitespace and case", () => {
    expect(parseCompareParam(" RO , bg ", known, 3)).toEqual(["ro", "bg"]);
  });

  it("drops codes with no data rather than rendering an empty column", () => {
    expect(parseCompareParam("ro,xx,bg", known, 3)).toEqual(["ro", "bg"]);
  });

  it("collapses duplicates", () => {
    expect(parseCompareParam("ro,ro,bg", known, 3)).toEqual(["ro", "bg"]);
  });

  it("caps a hand-edited link at the maximum", () => {
    expect(parseCompareParam("ro,bg,rs", known, 2)).toEqual(["ro", "bg"]);
  });
});

describe("parseCountryParam", () => {
  it("accepts a two-letter code in any case", () => {
    expect(parseCountryParam("ro")).toBe("ro");
    expect(parseCountryParam("RO")).toBe("ro");
  });

  it("rejects anything else", () => {
    for (const raw of [null, "", "rou", "r", "r1", "ro,bg"]) {
      expect(parseCountryParam(raw)).toBeNull();
    }
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
    const f = buildMonthFilters(2026, sel, toMonthIndex(2026, 8));
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
    expect(
      serializeMapParams({
        month: toMonthIndex(2026, 8),
        selection: fullSelection(),
        defaultMonth: toMonthIndex(2026, 8),
      }),
    ).toBe("");
  });

  it("writes only the narrowed categories, in MAP_STATUSES order", () => {
    const sel = toggleStatus(fullSelection(), "railway", "tendered");
    const params = new URLSearchParams(
      serializeMapParams({
        month: toMonthIndex(2026, 8),
        selection: sel,
        defaultMonth: toMonthIndex(2026, 8),
      }),
    );
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
      serializeMapParams({
        month: 2005,
        selection: sel,
        selectedLot: { projectId: "ro-a1", lotId: "lot-1" },
        defaultMonth: toMonthIndex(2026, 8),
      }),
    );
    const back = parseSelectionParam(params.get("cat"), params.get("st"));
    expect(selectionCategories(back)).toEqual(selectionCategories(sel));
    expect([...back.get("railway")!]).toEqual([...sel.get("railway")!]);
    expect(back.has("tunnel")).toBe(false);
  });
});

describe("camera and city in the permalink", () => {
  const allCats = fullSelection();
  const NOW = toMonthIndex(2026, 8);
  const base = { month: NOW, selection: allCats, defaultMonth: NOW };
  const HOME = { longitude: 24.97, latitude: 45.9, zoom: 5.6 };

  it("omits the camera when it still matches the opening view", () => {
    expect(serializeMapParams({ ...base, view: HOME, defaultView: HOME })).toBe(
      "",
    );
  });

  it("writes the camera as lng,lat,zoom once it has moved", () => {
    const qs = serializeMapParams({
      ...base,
      view: { longitude: 26.1025, latitude: 44.4268, zoom: 12.5 },
      defaultView: HOME,
    });
    expect(new URLSearchParams(qs).get("v")).toBe("26.1025,44.4268,12.5");
  });

  it("rounds the camera rather than serializing float noise", () => {
    const qs = serializeMapParams({
      ...base,
      view: {
        longitude: 26.102546789012,
        latitude: 44.426777123456,
        zoom: 12.503999,
      },
      defaultView: HOME,
    });
    expect(new URLSearchParams(qs).get("v")).toBe("26.10255,44.42678,12.5");
  });

  it("treats a sub-precision nudge as no movement at all", () => {
    // Panning by a millimetre must not make every URL differ.
    expect(
      serializeMapParams({
        ...base,
        view: { longitude: 24.9700001, latitude: 45.9000001, zoom: 5.6000001 },
        defaultView: HOME,
      }),
    ).toBe("");
  });

  it("writes a selected city", () => {
    expect(
      serializeMapParams({ ...base, selectedCity: "ro-bucharest" }),
    ).toBe("city=ro-bucharest");
  });

  it("never writes two selections at once", () => {
    // All three share one panel, so the URL must carry one at most.
    const qs = serializeMapParams({
      ...base,
      selectedLot: { projectId: "ro-a1", lotId: "lot-1" },
      selectedCountry: "ro",
      selectedCity: "ro-bucharest",
    });
    const params = new URLSearchParams(qs);
    expect(params.get("sel")).toBe("ro-a1.lot-1");
    expect(params.get("c")).toBeNull();
    expect(params.get("city")).toBeNull();
  });

  it("prefers a country over a city when both are somehow set", () => {
    const params = new URLSearchParams(
      serializeMapParams({
        ...base,
        selectedCountry: "ro",
        selectedCity: "ro-bucharest",
      }),
    );
    expect(params.get("c")).toBe("ro");
    expect(params.get("city")).toBeNull();
  });
});

describe("basemap and comparison in the permalink", () => {
  const NOW = toMonthIndex(2026, 8);
  const base = { month: NOW, selection: fullSelection(), defaultMonth: NOW };

  it("writes the basemap only when one is chosen", () => {
    expect(serializeMapParams({ ...base, basemap: null })).toBe("");
    expect(serializeMapParams({ ...base, basemap: "dark" })).toBe("bm=dark");
  });

  it("writes the comparison baseline as a month", () => {
    const qs = serializeMapParams({
      ...base,
      compareFrom: toMonthIndex(2015, 1),
    });
    expect(new URLSearchParams(qs).get("cmp")).toBe("2015-01");
  });

  it("leaves the comparison out when it is off", () => {
    expect(serializeMapParams({ ...base, compareFrom: null })).toBe("");
  });

  it("round-trips a shared comparison link", () => {
    const from = toMonthIndex(2015, 1);
    const qs = serializeMapParams({ ...base, compareFrom: from, basemap: "dark" });
    const params = new URLSearchParams(qs);
    expect(
      parseMonthParam(params.get("cmp"), HARD_MIN_MONTH, NOW + 120, NOW),
    ).toBe(from);
    expect(params.get("bm")).toBe("dark");
  });
});

describe("parseViewParam", () => {
  it("round-trips what the serializer writes", () => {
    const view = { longitude: 26.1025, latitude: 44.4268, zoom: 12.5 };
    expect(parseViewParam(formatViewParam(view))).toEqual(view);
  });

  it("returns null for anything malformed", () => {
    for (const raw of [
      null,
      "",
      "26.1",
      "26.1,44.4",
      "a,b,c",
      "26.1,44.4,12.5,7",
      "26.1;44.4;12.5",
    ]) {
      expect(parseViewParam(raw)).toBeNull();
    }
  });

  it("rejects coordinates and zooms outside the possible range", () => {
    // A shared link is untrusted input: an out-of-range camera throws
    // inside MapLibre rather than degrading.
    expect(parseViewParam("181,44.4,12")).toBeNull();
    expect(parseViewParam("26.1,91,12")).toBeNull();
    expect(parseViewParam("26.1,44.4,-1")).toBeNull();
    expect(parseViewParam("26.1,44.4,25")).toBeNull();
    expect(parseViewParam("NaN,44.4,12")).toBeNull();
  });

  it("accepts the extremes of the valid range", () => {
    expect(parseViewParam("-180,-90,0")).toEqual({
      longitude: -180,
      latitude: -90,
      zoom: 0,
    });
    expect(parseViewParam("180,90,24")).toEqual({
      longitude: 180,
      latitude: 90,
      zoom: 24,
    });
  });
});

describe("lot references in ?sel=", () => {
  // Lot ids are unique within a project, not globally: "main-bridge" is a
  // lot of ro-braila-bridge, ro-giurgiu-ruse-bridge and ro-new-europe-bridge.
  const bridges = [
    { projectId: "ro-braila-bridge", lotId: "main-bridge" },
    { projectId: "ro-giurgiu-ruse-bridge", lotId: "main-bridge" },
    { projectId: "ro-new-europe-bridge", lotId: "main-bridge" },
    { projectId: "ro-a1", lotId: "sebes-turda" },
  ];

  it("qualifies the lot with its project", () => {
    expect(
      formatLotRef({ projectId: "ro-braila-bridge", lotId: "main-bridge" }),
    ).toBe("ro-braila-bridge.main-bridge");
  });

  it("survives the URL without percent-encoding", () => {
    const qs = serializeMapParams({
      month: toMonthIndex(2026, 8),
      selection: fullSelection(),
      defaultMonth: toMonthIndex(2026, 8),
      selectedLot: { projectId: "ro-braila-bridge", lotId: "main-bridge" },
    });
    expect(qs).toBe("sel=ro-braila-bridge.main-bridge");
  });

  it("parses a qualified reference", () => {
    expect(parseLotRef("ro-braila-bridge.main-bridge")).toEqual({
      projectId: "ro-braila-bridge",
      lotId: "main-bridge",
    });
  });

  it("parses a legacy bare lot id as unqualified", () => {
    expect(parseLotRef("main-bridge")).toEqual({
      projectId: null,
      lotId: "main-bridge",
    });
  });

  it("rejects junk", () => {
    for (const raw of [null, "", "a.b.c", ".", "x."]) {
      expect(parseLotRef(raw)).toBeNull();
    }
  });

  it("resolves a qualified reference to exactly that lot", () => {
    const ref = parseLotRef("ro-giurgiu-ruse-bridge.main-bridge");
    expect(resolveLotRef(bridges, ref)?.projectId).toBe(
      "ro-giurgiu-ruse-bridge",
    );
  });

  it("still resolves a legacy id that is unambiguous", () => {
    const ref = parseLotRef("sebes-turda");
    expect(resolveLotRef(bridges, ref)?.projectId).toBe("ro-a1");
  });

  it("refuses a legacy id shared by several projects", () => {
    // Selecting the first match is the bug: two of the three bridges opened
    // the wrong one. Selecting nothing is wrong in a way the user can see.
    expect(resolveLotRef(bridges, parseLotRef("main-bridge"))).toBeNull();
  });

  it("resolves nothing for a lot that is not there", () => {
    expect(resolveLotRef(bridges, parseLotRef("ro-a1.nope"))).toBeNull();
    expect(resolveLotRef(bridges, null)).toBeNull();
  });

  it("round-trips through the query string", () => {
    const lot = { projectId: "ro-new-europe-bridge", lotId: "main-bridge" };
    const qs = serializeMapParams({
      month: toMonthIndex(2026, 8),
      selection: fullSelection(),
      defaultMonth: toMonthIndex(2026, 8),
      selectedLot: lot,
    });
    const raw = new URLSearchParams(qs).get("sel");
    expect(resolveLotRef(bridges, parseLotRef(raw))).toMatchObject(lot);
  });
});

describe("parseCityParam", () => {
  it("accepts a key in the data", () => {
    const known = ["ro-bucharest", "bg-sofia"];
    expect(parseCityParam("ro-bucharest", known)).toBe("ro-bucharest");
  });

  it("drops a key that is not in the data", () => {
    // Same reasoning as parseCompareParam: the panel would never mount, so
    // there would be no way to clear it.
    expect(parseCityParam("xx-atlantis", ["ro-bucharest"])).toBeNull();
    expect(parseCityParam(null, ["ro-bucharest"])).toBeNull();
    expect(parseCityParam("", ["ro-bucharest"])).toBeNull();
  });
});

describe("status is evaluated at the viewed year", () => {
  const NOW = 2026;

  it("unticking 'opened' hides the opened layer but keeps building sites", () => {
    const sel = toggleStatus(fullSelection(["highway"]), "highway", "opened");
    const f = buildMonthFilters(2010, sel, NOW);
    // opened layer: no categories left to draw
    expect(JSON.stringify(f.opened)).toContain('["literal",[]]');
    // under-construction layer: highways still drawn
    expect(JSON.stringify(f.underConstruction)).toContain('["literal",["highway"]]');
  });

  it("unticking 'under construction' hides only building sites", () => {
    const sel = toggleStatus(fullSelection(["railway"]), "railway", "under_construction");
    const f = buildMonthFilters(2010, sel, NOW);
    expect(JSON.stringify(f.opened)).toContain('["literal",["railway"]]');
    expect(JSON.stringify(f.underConstruction)).toContain('["literal",[]]');
  });

  it("judges a lot by the month, not by the status it carries today", () => {
    // A lot that is "opened" today is a building site in 2010; it is the
    // under-construction checkbox that governs it there, and the year layers
    // never look at the declared status at all.
    const sel = fullSelection(["highway"]);
    const viewed = toMonthIndex(2010, 1);
    const f = buildMonthFilters(viewed, sel, NOW);
    expect(JSON.stringify(f.underConstruction)).not.toContain('["get","status"]');
    expect(JSON.stringify(f.underConstruction)).toContain(
      `["<=",["get","constructionStartMonth"],${viewed}]`,
    );
  });

  it("keeps every layer empty when a category is switched off entirely", () => {
    const sel = toggleCategory(fullSelection(), "tunnel");
    const f = buildMonthFilters(2026, sel, NOW);
    for (const filter of [f.opened, f.underConstruction, f.future]) {
      expect(JSON.stringify(filter)).not.toContain('"tunnel"');
    }
  });
});
