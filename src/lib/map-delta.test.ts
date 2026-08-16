import { describe, it, expect } from "vitest";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import { toMonthIndex } from "./map-filters";
import { newlyOpenedFilter, openedBetween, type DeltaWindow } from "./map-delta";
import type { LotEntry } from "./lot-list";

const NOW = toMonthIndex(2026, 8);

function lot(props: Partial<LotEntry>): LotEntry {
  return {
    lotId: "lot",
    projectId: "ro-a1",
    projectName: "A1 motorway",
    lotName: "Section",
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

describe("openedBetween", () => {
  const a = lot({ lotId: "a", openedMonth: toMonthIndex(2021, 6), lengthKm: 20 });
  const b = lot({ lotId: "b", openedMonth: toMonthIndex(2023, 3), lengthKm: 18 });
  const old = lot({ lotId: "old", openedMonth: toMonthIndex(2010, 1), lengthKm: 99 });
  const never = lot({ lotId: "never", status: "planned" });

  const window = (from: number, to: number): DeltaWindow => ({
    from,
    to,
    nowMonth: NOW,
  });

  it("counts what became open inside the window", () => {
    const d = openedBetween(
      [a, b, old, never],
      window(toMonthIndex(2020, 1), toMonthIndex(2024, 1)),
    );
    expect(d.lots.map((l) => l.lotId)).toEqual(["a", "b"]);
    expect(d.km).toBe(38);
    expect(d.count).toBe(2);
  });

  it("excludes what was already open at the start", () => {
    const d = openedBetween([old], window(toMonthIndex(2020, 1), NOW));
    expect(d.count).toBe(0);
    expect(d.km).toBe(0);
  });

  it("treats the window as open at the start and closed at the end", () => {
    // A lot opening exactly on the baseline month was already there.
    const at = toMonthIndex(2021, 6);
    expect(openedBetween([a], window(at, NOW)).count).toBe(0);
    expect(openedBetween([a], window(at - 1, at)).count).toBe(1);
  });

  it("returns nothing when the window is empty or inverted", () => {
    expect(openedBetween([a, b], window(NOW, NOW)).count).toBe(0);
    expect(
      openedBetween([a, b], window(NOW, toMonthIndex(2020, 1))).count,
    ).toBe(0);
  });

  // AGENTS.md: there are two ways another project already counts a lot's
  // kilometres, and every total that spans projects has to apply both. This
  // is one of those totals, so it gets a case for each.
  const shared = lot({
    lotId: "shared",
    projectId: "ro-metro-m3",
    sharedWith: "ro-metro-m1",
    openedMonth: toMonthIndex(2022, 1),
    lengthKm: 8.67,
  });
  const contained = lot({
    lotId: "contained",
    projectId: "ro-tunnels",
    partOf: "ro-a1",
    openedMonth: toMonthIndex(2022, 6),
    lengthKm: 6.7,
  });

  // `shared` is track another line owns. `contained` is a tunnel bored
  // inside an A1 section that already measures its length. The second is the
  // one that shipped wrong, because `partOf` never reached the feature.
  it.each([
    ["shared track", shared, 8.7], // rounded like every other figure here
    ["a contained structure", contained, 6.7],
  ])(
    "leaves %s out of the kilometres but keeps it in the list",
    (_name, excluded, alsoCountedKm) => {
      const d = openedBetween(
        [a, excluded as LotEntry],
        window(toMonthIndex(2020, 1), toMonthIndex(2024, 1)),
      );
      expect(d.km).toBe(20);
      expect(d.alsoCountedKm).toBe(alsoCountedKm);
      expect(d.count).toBe(2);
    },
  );

  it("holds both kinds back from one figure", () => {
    const d = openedBetween(
      [a, shared, contained],
      window(toMonthIndex(2020, 1), toMonthIndex(2024, 1)),
    );
    expect(d.km).toBe(20);
    expect(d.alsoCountedKm).toBe(15.4);
  });

  it("applies the rule to a projected opening as well", () => {
    // How the bug actually reached a reader: no partOf lot has an opened
    // date, but twelve have an expectedOpening, so scrubbing past it made
    // them "effectively opened" and added them to the total.
    const projectedTunnel = lot({
      lotId: "ormenis",
      projectId: "ro-rail-tunnels",
      partOf: "ro-rail-brasov-sighisoara",
      status: "under_construction",
      constructionStartMonth: toMonthIndex(2023, 1),
      expectedOpeningMonth: toMonthIndex(2026, 10),
      lengthKm: 6.7,
    });
    const ahead = openedBetween(
      [projectedTunnel],
      window(NOW, toMonthIndex(2027, 1)),
    );
    expect(ahead.count).toBe(1);
    expect(ahead.km).toBe(0);
    expect(ahead.alsoCountedKm).toBe(6.7);
    // And it is not counted as projected either: projectedKm qualifies `km`.
    expect(ahead.projectedKm).toBe(0);
  });

  it("counts a projected opening only past the present", () => {
    const projected = lot({
      lotId: "p",
      status: "under_construction",
      constructionStartMonth: toMonthIndex(2024, 1),
      expectedOpeningMonth: toMonthIndex(2028, 6),
      expectedOpeningDerived: true,
      lengthKm: 12,
    });
    expect(openedBetween([projected], window(toMonthIndex(2024, 1), NOW)).count).toBe(0);
    const ahead = openedBetween(
      [projected],
      window(NOW, toMonthIndex(2029, 1)),
    );
    expect(ahead.count).toBe(1);
    expect(ahead.projectedKm).toBe(12);
    // Kilometres that rest on a projection are reported apart from the rest.
    expect(ahead.km).toBe(12);
  });

  it("rounds the kilometres to one decimal", () => {
    const x = lot({ lotId: "x", openedMonth: toMonthIndex(2021, 1), lengthKm: 1.05 });
    const y = lot({ lotId: "y", openedMonth: toMonthIndex(2021, 2), lengthKm: 2.26 });
    const d = openedBetween([x, y], window(toMonthIndex(2020, 1), NOW));
    expect(d.km).toBe(3.3);
  });
});

describe("newlyOpenedFilter", () => {
  // The highlight layer has to agree with the readout, or the map shows a
  // different set of roads from the one the number counts.
  const matches = (spec: unknown, props: LotEntry) =>
    featureFilter(spec as never).filter({ zoom: 6 } as never, {
      type: 2,
      properties: props,
    } as never);

  const cases = [
    lot({ lotId: "a", openedMonth: toMonthIndex(2021, 6) }),
    lot({ lotId: "old", openedMonth: toMonthIndex(2010, 1) }),
    lot({ lotId: "planned", status: "planned" }),
    lot({
      lotId: "projected",
      expectedOpeningMonth: toMonthIndex(2028, 6),
      constructionStartMonth: toMonthIndex(2024, 1),
      status: "under_construction",
    }),
  ];

  const windows: DeltaWindow[] = [
    { from: toMonthIndex(2020, 1), to: toMonthIndex(2024, 1), nowMonth: NOW },
    { from: toMonthIndex(2005, 1), to: NOW, nowMonth: NOW },
    { from: NOW, to: toMonthIndex(2029, 1), nowMonth: NOW },
  ];

  it("selects exactly the lots the readout counts", () => {
    let hits = 0;
    for (const w of windows) {
      const expected = new Set(openedBetween(cases, w).lots.map((l) => l.lotId));
      const filter = newlyOpenedFilter(w);
      for (const props of cases) {
        const drawn = matches(filter, props);
        if (drawn) hits++;
        expect({ lot: props.lotId, from: w.from, drawn }).toEqual({
          lot: props.lotId,
          from: w.from,
          drawn: expected.has(props.lotId),
        });
      }
    }
    // Guard against agreeing only because nothing ever matches.
    expect(hits).toBeGreaterThan(2);
  });

  it("matches nothing when the window is empty", () => {
    const filter = newlyOpenedFilter({ from: NOW, to: NOW, nowMonth: NOW });
    for (const props of cases) expect(matches(filter, props)).toBe(false);
  });

  it("carries no zoom term, so it is safe beside a width interpolate", () => {
    const json = JSON.stringify(newlyOpenedFilter(windows[0]));
    expect(json).not.toContain("zoom");
    expect(json).not.toContain("interpolate");
  });
});
