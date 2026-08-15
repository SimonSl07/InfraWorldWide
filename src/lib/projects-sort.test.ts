import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROJECT_SORT,
  parseProjectSort,
  sortProjects,
} from "./projects-sort";

interface Row {
  id: string;
  name: string;
  country: string;
  lengthKm: number;
}

const rows: Row[] = [
  { id: "ro-a3", name: "A3 motorway", country: "Romania", lengthKm: 120 },
  { id: "bg-a2", name: "Șoseaua Hemus", country: "Bulgaria", lengthKm: 400 },
  { id: "ro-a1", name: "A1 motorway", country: "Romania", lengthKm: 400 },
];

const keyOf = (r: Row) => ({
  name: r.name,
  country: r.country,
  lengthKm: r.lengthKm,
});
const ids = (list: Row[]) => list.map((r) => r.id);

describe("parseProjectSort", () => {
  it("accepts the sorts the control offers", () => {
    expect(parseProjectSort("length")).toBe("length");
    expect(parseProjectSort("country")).toBe("country");
  });

  it("falls back to the default for anything else", () => {
    // A shared link is untrusted input; an unknown sort is not an error page.
    expect(parseProjectSort("cost")).toBe(DEFAULT_PROJECT_SORT);
    expect(parseProjectSort(null)).toBe(DEFAULT_PROJECT_SORT);
  });
});

describe("sortProjects", () => {
  it("orders by name in the reader's collation", () => {
    // "Ș" sorts after "S" in Romanian, which a byte comparison gets wrong.
    expect(ids(sortProjects(rows, "name", { keyOf, locale: "ro" }))).toEqual([
      "ro-a1",
      "ro-a3",
      "bg-a2",
    ]);
  });

  it("orders by length, longest first", () => {
    // The two 400 km rows come before the 120 km one, in name order.
    expect(ids(sortProjects(rows, "length", { keyOf, locale: "en" }))).toEqual([
      "ro-a1",
      "bg-a2",
      "ro-a3",
    ]);
  });

  it("breaks a tie by name, so the order never wobbles between renders", () => {
    const tied = sortProjects(
      [rows[1], rows[2]],
      "length",
      { keyOf, locale: "en" },
    );
    expect(ids(tied)).toEqual(["ro-a1", "bg-a2"]);
  });

  it("groups by country, then by name inside it", () => {
    expect(ids(sortProjects(rows, "country", { keyOf, locale: "en" }))).toEqual([
      "bg-a2",
      "ro-a1",
      "ro-a3",
    ]);
  });

  it("leaves the input array alone", () => {
    const input = [...rows];
    sortProjects(input, "length", { keyOf, locale: "en" });
    expect(ids(input)).toEqual(ids(rows));
  });
});
