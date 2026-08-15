import { describe, it, expect } from "vitest";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import {
  buildMonthFilters,
  fullSelection,
  shouldShowFuture,
  toMonthIndex,
  toggleCategory,
  toggleStatus,
} from "./map-filters";
import {
  isLotVisible,
  lotStateInMonth,
  searchLots,
  visibleLots,
  type LotEntry,
} from "./lot-list";

const NOW = toMonthIndex(2026, 8);

function lot(props: Partial<LotEntry>): LotEntry {
  return {
    lotId: "lot",
    projectId: "ro-a1",
    projectName: "A1 motorway",
    lotName: "Sebeș–Turda",
    country: "ro",
    category: "highway",
    status: "opened",
    lengthKm: 10,
    openedMonth: null,
    constructionStartMonth: null,
    expectedOpeningMonth: null,
    opened: null,
    expectedOpening: null,
    expectedOpeningDerived: false,
    ...props,
  };
}

describe("lotStateInMonth", () => {
  it("is opened from the month it opened", () => {
    const l = lot({ openedMonth: toMonthIndex(2015, 3) });
    expect(lotStateInMonth(l, toMonthIndex(2015, 2), NOW)).not.toBe("opened");
    expect(lotStateInMonth(l, toMonthIndex(2015, 3), NOW)).toBe("opened");
  });

  it("is under construction between the start and the opening", () => {
    const l = lot({
      constructionStartMonth: toMonthIndex(2012, 1),
      openedMonth: toMonthIndex(2015, 3),
    });
    expect(lotStateInMonth(l, toMonthIndex(2013, 6), NOW)).toBe(
      "under_construction",
    );
  });

  it("does not call an opened lot with no start date 'planned'", () => {
    // The rule the whole dataset depends on: a missing construction start is
    // unrecorded history, not a road that was never begun.
    const l = lot({ openedMonth: toMonthIndex(1975, 1) });
    expect(lotStateInMonth(l, toMonthIndex(1960, 1), NOW)).toBeNull();
  });

  it("only shows not-yet-started lots at the present or later", () => {
    const l = lot({ status: "planned" });
    expect(lotStateInMonth(l, toMonthIndex(2020, 1), NOW)).toBeNull();
    expect(lotStateInMonth(l, NOW, NOW)).toBe("future");
  });

  it("counts a projected opening only when looking into the future", () => {
    const l = lot({
      status: "under_construction",
      constructionStartMonth: toMonthIndex(2024, 1),
      expectedOpeningMonth: toMonthIndex(2028, 6),
    });
    expect(lotStateInMonth(l, NOW, NOW)).toBe("under_construction");
    expect(lotStateInMonth(l, toMonthIndex(2029, 1), NOW)).toBe("opened");
  });
});

describe("isLotVisible agrees with the MapLibre filters", () => {
  // Two implementations of one rule drift. This pins the plain-TS predicate
  // the keyboard list uses against the expressions the map actually renders.
  const matches = (spec: unknown, props: LotEntry) =>
    featureFilter(spec as never).filter({ zoom: 6 } as never, {
      type: 2,
      properties: props,
    } as never);

  const cases: LotEntry[] = [
    lot({ openedMonth: toMonthIndex(1975, 1) }),
    lot({
      constructionStartMonth: toMonthIndex(2012, 1),
      openedMonth: toMonthIndex(2015, 3),
    }),
    lot({ status: "planned", category: "railway" }),
    lot({ status: "tendered", category: "bridge" }),
    lot({
      status: "under_construction",
      category: "tunnel",
      constructionStartMonth: toMonthIndex(2024, 1),
      expectedOpeningMonth: toMonthIndex(2028, 6),
      expectedOpeningDerived: true,
    }),
    lot({ status: "planned", expectedOpeningMonth: toMonthIndex(2030, 1) }),
  ];

  const selections = [
    fullSelection(),
    toggleCategory(fullSelection(), "tunnel"),
    toggleStatus(fullSelection(), "highway", "opened"),
    toggleStatus(fullSelection(), "railway", "planned"),
  ];

  const months = [
    toMonthIndex(1960, 1),
    toMonthIndex(2013, 6),
    toMonthIndex(2020, 1),
    NOW,
    toMonthIndex(2029, 1),
  ];

  it("matches the rendered layers on every combination", () => {
    let drawnCount = 0;
    let hiddenCount = 0;
    for (const selection of selections) {
      for (const month of months) {
        const f = buildMonthFilters(month, selection, NOW);
        const future = shouldShowFuture(month, NOW);
        for (const props of cases) {
          const drawn =
            matches(f.opened, props) ||
            matches(f.underConstruction, props) ||
            (future && matches(f.future, props));
          if (drawn) drawnCount++;
          else hiddenCount++;
          expect({
            month,
            lot: props.lotId,
            status: props.status,
            visible: isLotVisible(props, selection, month, NOW),
          }).toEqual({
            month,
            lot: props.lotId,
            status: props.status,
            visible: drawn,
          });
        }
      }
    }
    // Guard against the matrix agreeing only because nothing is ever drawn.
    expect(drawnCount).toBeGreaterThan(20);
    expect(hiddenCount).toBeGreaterThan(20);
  });
});

describe("visibleLots", () => {
  /** A map feature carries loose properties; LotEntry is what we read off it. */
  const feature = (props: object | null) => ({
    properties: props as Record<string, unknown> | null,
  });

  it("keeps only the drawn lots, in the order given", () => {
    const features = [
      feature(lot({ lotId: "a", openedMonth: toMonthIndex(1975, 1) })),
      feature(lot({ lotId: "b", status: "planned" })),
      feature(null),
    ];
    const out = visibleLots(features, fullSelection(), NOW, NOW);
    expect(out.map((l) => l.lotId)).toEqual(["a", "b"]);
  });

  it("drops the midpoint marker duplicates the build emits", () => {
    // Bridges and tunnels get a second Point feature with the same props.
    const props = lot({ lotId: "bridge-1", category: "bridge", openedMonth: 0 });
    const features = [feature(props), feature({ ...props, marker: true })];
    expect(visibleLots(features, fullSelection(), NOW, NOW)).toHaveLength(1);
  });
});

describe("searchLots", () => {
  const entries = [
    lot({ lotId: "1", projectName: "A1 motorway", lotName: "Sebeș–Turda" }),
    lot({ lotId: "2", projectName: "A3 Transylvania", lotName: "Câmpia Turzii" }),
    lot({
      lotId: "3",
      projectName: "Bucharest Metro Line M2",
      lotName: "Pipera",
      category: "railway",
    }),
  ];

  it("returns everything when the query is blank", () => {
    expect(searchLots(entries, "  ")).toHaveLength(3);
  });

  it("matches on the project name", () => {
    expect(searchLots(entries, "metro").map((l) => l.lotId)).toEqual(["3"]);
  });

  it("matches on the lot name", () => {
    expect(searchLots(entries, "pipera").map((l) => l.lotId)).toEqual(["3"]);
  });

  it("ignores diacritics in both directions", () => {
    // Nobody types the comma-below s, and the data always carries it.
    expect(searchLots(entries, "sebes").map((l) => l.lotId)).toEqual(["1"]);
    expect(searchLots(entries, "Sebeș").map((l) => l.lotId)).toEqual(["1"]);
    expect(searchLots(entries, "campia").map((l) => l.lotId)).toEqual(["2"]);
  });

  it("ranks a project-name hit above a lot-name-only hit", () => {
    const mixed = [
      lot({ lotId: "lot-hit", projectName: "A7", lotName: "Turda bypass" }),
      lot({ lotId: "name-hit", projectName: "Turda ring", lotName: "north" }),
    ];
    expect(searchLots(mixed, "turda").map((l) => l.lotId)).toEqual([
      "name-hit",
      "lot-hit",
    ]);
  });

  it("caps the result list", () => {
    expect(searchLots(entries, "", 2)).toHaveLength(2);
  });

  it("finds nothing for a query that matches nothing", () => {
    expect(searchLots(entries, "zzzz")).toEqual([]);
  });
});
