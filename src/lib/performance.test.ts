import { describe, it, expect } from "vitest";
import {
  bestCost,
  lotCostRows,
  openedLots,
  orderByMedianSlip,
  orderDescNullsLast,
  projectCostRows,
  toComparable,
  type CostOptions,
} from "./performance";
import { createDeflator } from "./deflator";
import { createConverter } from "./fx";
import type { GroupRanking, LotMetric } from "./rankings";
import type { DeflatorTable, FxTable, Money } from "./schema";

const deflators: DeflatorTable = {
  baseYear: 2020,
  note: "test",
  sources: [{ title: "test", url: "https://example.org" }],
  series: {
    EUR: {
      geo: "EA",
      label: { en: "euro area" },
      // 25% cumulative inflation between 2015 and 2023.
      index: { "2015": 100, "2020": 110, "2023": 125 },
    },
    RON: {
      geo: "RO",
      label: { en: "Romania" },
      index: { "2015": 100, "2020": 110, "2023": 125 },
    },
  },
};

const fx: FxTable = {
  base: "EUR",
  note: "test",
  sources: [{ title: "test", url: "https://example.org" }],
  rates: {
    RON: { label: { en: "leu" }, perEur: { "2015": 4.0, "2023": 5.0 } },
  },
};

const options: CostOptions = {
  deflate: createDeflator(deflators),
  convert: createConverter(fx),
  priceYear: 2023,
};

const money = (amount: number, currency: string, year: number): Money => ({
  amount,
  currency,
  year,
});

function metric(over: Partial<LotMetric> = {}): LotMetric {
  return {
    projectId: "ro-a1",
    projectName: { en: "A1" },
    lotId: "lot-1",
    lotName: { en: "Lot 1" },
    country: "ro",
    category: "highway",
    status: "opened",
    lengthKm: 10,
    sharedWith: null,
    partOf: null,
    openedMonth: 2020 * 12,
    overrun: { estimate: null, award: null },
    costs: { actual: null, award: null, estimate: null },
    slip: null,
    contractors: [],
    ...over,
  };
}

describe("bestCost", () => {
  it("prefers actual over award over estimate", () => {
    const all = metric({
      costs: {
        actual: money(1, "EUR", 2023),
        award: money(2, "EUR", 2023),
        estimate: money(3, "EUR", 2023),
      },
    });
    expect(bestCost(all)?.basis).toBe("actual");

    const noActual = metric({
      costs: {
        actual: null,
        award: money(2, "EUR", 2023),
        estimate: money(3, "EUR", 2023),
      },
    });
    expect(bestCost(noActual)?.basis).toBe("award");

    const onlyEstimate = metric({
      costs: { actual: null, award: null, estimate: money(3, "EUR", 2023) },
    });
    expect(bestCost(onlyEstimate)?.basis).toBe("estimate");
  });

  it("is null when a lot has no cost at all", () => {
    expect(bestCost(metric())).toBeNull();
  });
});

describe("toComparable", () => {
  it("deflates and then converts, in that order", () => {
    // 400 RON of 2015 money → 500 RON of 2023 money (index 100→125)
    // → 100 EUR at the 2023 rate of 5.0.
    const result = toComparable(money(400, "RON", 2015), options);
    expect(result?.amount).toBeCloseTo(100, 6);
    expect(result?.currency).toBe("EUR");
    expect(result?.year).toBe(2023);
  });

  it("would give a different answer if converted before deflating", () => {
    // Guards the ordering: converting first uses the 2015 rate of 4.0,
    // giving 100 EUR of 2015 money → 125 EUR of 2023 money. The correct
    // order gives 100. If these ever agree the test has stopped meaning
    // anything.
    const correct = toComparable(money(400, "RON", 2015), options);
    const wrongOrder = (400 / 4.0) * (125 / 100);
    expect(correct?.amount).not.toBeCloseTo(wrongOrder, 3);
  });

  it("refuses a currency with no published rates", () => {
    expect(toComparable(money(100, "BGN", 2023), options)).toBeNull();
  });

  it("refuses a price year outside the deflator series", () => {
    expect(toComparable(money(100, "EUR", 1990), options)).toBeNull();
  });

  it("refuses a figure recorded without a price year", () => {
    expect(
      toComparable({ amount: 100, currency: "EUR" }, options),
    ).toBeNull();
  });

  it("refuses a programme figure even though it could be restated", () => {
    // The tables would happily deflate and convert this. It is still one
    // number for a whole corridor, so it is not a cost per kilometre of
    // anything and must not be ranked as one.
    expect(
      toComparable(
        { amount: 745, currency: "EUR", year: 2023, scope: "programme" },
        options,
      ),
    ).toBeNull();
  });
});

describe("lotCostRows", () => {
  it("skips lots with no cost figure", () => {
    const rows = lotCostRows([metric(), metric()], options);
    expect(rows).toEqual([]);
  });

  it("computes cost per kilometre from the comparable figure", () => {
    const rows = lotCostRows(
      [metric({ lengthKm: 20, costs: { actual: money(500, "EUR", 2023), award: null, estimate: null } })],
      options,
    );
    expect(rows[0].perKm).toBeCloseTo(25, 6);
  });

  it("keeps the recorded figure but nulls perKm when not comparable", () => {
    const rows = lotCostRows(
      [metric({ costs: { actual: money(500, "BGN", 2023), award: null, estimate: null } })],
      options,
    );
    expect(rows[0].cost.recorded.currency).toBe("BGN");
    expect(rows[0].cost.comparable).toBeNull();
    expect(rows[0].perKm).toBeNull();
  });

  it("does not divide by a zero-length lot", () => {
    // lengthKm is schema-positive, but the guard is cheap and an Infinity
    // here would sort to the top of the table.
    const rows = lotCostRows(
      [metric({ lengthKm: 0, costs: { actual: money(5, "EUR", 2023), award: null, estimate: null } })],
      options,
    );
    expect(rows[0].perKm).toBeNull();
  });
});

describe("projectCostRows", () => {
  const eur = (amount: number) => money(amount, "EUR", 2023);

  it("sums comparable lot costs into one project total", () => {
    const rows = projectCostRows(
      [
        metric({ lotId: "a", lengthKm: 10, costs: { actual: eur(100), award: null, estimate: null } }),
        metric({ lotId: "b", lengthKm: 30, costs: { actual: eur(200), award: null, estimate: null } }),
      ],
      options,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].total?.amount).toBeCloseTo(300, 6);
    expect(rows[0].costedKm).toBe(40);
    expect(rows[0].perKm).toBeCloseTo(7.5, 6);
    expect(rows[0].complete).toBe(true);
  });

  it("reports a partial total rather than pretending it is whole", () => {
    const rows = projectCostRows(
      [
        metric({ lotId: "a", lengthKm: 10, costs: { actual: eur(100), award: null, estimate: null } }),
        metric({ lotId: "b", lengthKm: 30 }),
      ],
      options,
    );
    expect(rows[0].complete).toBe(false);
    expect(rows[0].costedLots).toBe(1);
    expect(rows[0].totalLots).toBe(2);
    // perKm divides the cost by the costed length only, not the whole road.
    expect(rows[0].costedKm).toBe(10);
    expect(rows[0].totalKm).toBe(40);
    expect(rows[0].perKm).toBeCloseTo(10, 6);
  });

  it("gives a null total when no lot could be restated", () => {
    const rows = projectCostRows(
      [metric({ costs: { actual: money(100, "BGN", 2023), award: null, estimate: null } })],
      options,
    );
    expect(rows[0].total).toBeNull();
    expect(rows[0].perKm).toBeNull();
    expect(rows[0].costedLots).toBe(0);
  });

  it("groups lots by project", () => {
    const rows = projectCostRows(
      [
        metric({ projectId: "ro-a1", lotId: "a", costs: { actual: eur(1), award: null, estimate: null } }),
        metric({ projectId: "ro-a3", lotId: "b", costs: { actual: eur(2), award: null, estimate: null } }),
      ],
      options,
    );
    expect(rows.map((r) => r.projectId).sort()).toEqual(["ro-a1", "ro-a3"]);
  });
});

describe("orderDescNullsLast", () => {
  const rows = [{ v: 3 }, { v: null }, { v: 10 }, { v: -2 }];

  it("orders descending and parks nulls at the end", () => {
    expect(orderDescNullsLast(rows, (r) => r.v).map((r) => r.v)).toEqual([
      10, 3, -2, null,
    ]);
  });

  it("does not mutate the input", () => {
    const before = rows.map((r) => r.v);
    orderDescNullsLast(rows, (r) => r.v);
    expect(rows.map((r) => r.v)).toEqual(before);
  });
});

describe("orderByMedianSlip", () => {
  const group = (
    key: string,
    lots: number,
    medianSlip: number | null,
  ): GroupRanking => ({
    key,
    label: key,
    lots,
    km: 0,
    overrun: {
      estimate: { n: 0, median: null, worst: null, best: null },
      award: { n: 0, median: null, worst: null, best: null },
    },
    slip: { n: 1, median: medianSlip, worst: medianSlip, best: medianSlip },
    onTimeShare: null,
  });

  it("puts the worst median slip first", () => {
    const ordered = orderByMedianSlip([
      group("a", 3, 5),
      group("b", 3, 40),
      group("c", 3, -1),
    ]);
    expect(ordered.map((g) => g.key)).toEqual(["b", "a", "c"]);
  });

  it("keeps groups whose slip cannot be measured, at the end", () => {
    const ordered = orderByMedianSlip([
      group("unmeasured", 4, null),
      group("late", 4, 12),
    ]);
    expect(ordered.map((g) => g.key)).toEqual(["late", "unmeasured"]);
  });

  it("drops groups below the minimum lot count", () => {
    const ordered = orderByMedianSlip(
      [group("one-off", 1, 99), group("track-record", 2, 3)],
      2,
    );
    expect(ordered.map((g) => g.key)).toEqual(["track-record"]);
  });
});

describe("openedLots", () => {
  it("keeps only opened lots, newest first", () => {
    const list = openedLots([
      metric({ lotId: "old", openedMonth: 2010 * 12 }),
      metric({ lotId: "planned", status: "planned", openedMonth: null }),
      metric({ lotId: "new", openedMonth: 2024 * 12 }),
    ]);
    expect(list.map((m) => m.lotId)).toEqual(["new", "old"]);
  });

  it("drops an opened lot with no recorded month", () => {
    expect(openedLots([metric({ status: "opened", openedMonth: null })])).toEqual([]);
  });

  /**
   * The table lists sections across every project, so a tunnel two metro
   * lines run through would otherwise appear twice as the same physical
   * stretch of railway.
   */
  it("drops track shared with another line", () => {
    const list = openedLots([
      metric({ lotId: "own" }),
      metric({ lotId: "through-run", sharedWith: "bg-sofia-metro-m1" }),
    ]);
    expect(list.map((m) => m.lotId)).toEqual(["own"]);
  });

  it("drops a structure inside a section another project measures", () => {
    // The Poiana tunnel is bored inside an A1 section whose own length
    // already contains it, so listing both puts the same kilometres in the
    // table twice.
    const list = openedLots([
      metric({ lotId: "a1-section" }),
      metric({ lotId: "poiana-tunnel", partOf: "ro-a1" }),
    ]);
    expect(list.map((m) => m.lotId)).toEqual(["a1-section"]);
  });
});
