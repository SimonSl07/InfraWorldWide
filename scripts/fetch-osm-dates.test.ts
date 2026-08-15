import { describe, expect, it } from "vitest";
import { dateRecords } from "./fetch-osm-dates";

/** Shape Overpass returns for `out tags;`, trimmed to what is read. */
const elements: Array<{ tags?: Record<string, string> }> = [
  {
    tags: {
      ref: "A7",
      name: "Autostrada Moldovei",
      "construction:opening_date": "2026",
    },
  },
  {
    tags: {
      ref: "A7",
      name: "A0 Nord Lot 1",
      "construction:opening_date": "2026",
    },
  },
  { tags: { ref: "A7", "construction:opening_date": "2027" } },
  { tags: { ref: "A2", name: "Autostrada Soarelui", start_date: "2012-11-24" } },
  { tags: { name: "unnumbered", start_date: "1999" } },
  { tags: { ref: "A3" } },
  {},
];

describe("dateRecords", () => {
  it("keys on route, tag and value together", () => {
    expect(Object.keys(dateRecords(elements)).sort()).toEqual([
      "(no ref)|start_date=1999",
      "A2|start_date=2012-11-24",
      "A7|construction:opening_date=2026",
      "A7|construction:opening_date=2027",
    ]);
  });

  it("counts the ways behind a value and lists their names", () => {
    const record = dateRecords(elements)["A7|construction:opening_date=2026"];
    expect(record).toEqual({
      ref: "A7",
      tag: "construction:opening_date",
      value: "2026",
      ways: 2,
      names: "A0 Nord Lot 1, Autostrada Moldovei",
    });
  });

  it("keeps a nameless way, with an empty name list", () => {
    expect(dateRecords(elements)["A7|construction:opening_date=2027"].names).toBe("");
  });

  it("ignores ways carrying no date tag at all", () => {
    expect(Object.keys(dateRecords([{ tags: { ref: "A3" } }, {}]))).toEqual([]);
  });

  it("records each date tag on a way separately", () => {
    const records = dateRecords([
      { tags: { ref: "A1", start_date: "2010", opening_date: "2011" } },
    ]);
    expect(Object.keys(records).sort()).toEqual([
      "A1|opening_date=2011",
      "A1|start_date=2010",
    ]);
  });
});
