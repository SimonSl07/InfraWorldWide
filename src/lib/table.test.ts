import { describe, it, expect } from "vitest";
import {
  clampPage,
  nextSort,
  pageBounds,
  pageCount,
  pageSlice,
  sortRows,
  type SortValue,
} from "./table";

interface Row {
  id: string;
  slip: number | null;
  name: string;
}

const rows: Row[] = [
  { id: "a", slip: 12, name: "Alpha" },
  { id: "b", slip: null, name: "Bravo" },
  { id: "c", slip: -3, name: "Charlie" },
  { id: "d", slip: 12, name: "Delta" },
  { id: "e", slip: 40, name: "Echo" },
];

const valueOf = (row: Row, columnId: string): SortValue =>
  columnId === "slip" ? row.slip : row.name;

const ids = (list: Row[]) => list.map((r) => r.id);

describe("nextSort", () => {
  it("starts a column descending", () => {
    expect(nextSort(null, "slip")).toEqual({
      columnId: "slip",
      direction: "desc",
    });
  });

  it("goes descending → ascending → unsorted on the same column", () => {
    const first = nextSort(null, "slip");
    const second = nextSort(first, "slip");
    expect(second).toEqual({ columnId: "slip", direction: "asc" });
    expect(nextSort(second, "slip")).toBeNull();
  });

  it("restarts the cycle when a different column is clicked", () => {
    const asc = { columnId: "slip", direction: "asc" as const };
    expect(nextSort(asc, "name")).toEqual({
      columnId: "name",
      direction: "desc",
    });
  });
});

describe("sortRows", () => {
  it("returns the given order when unsorted", () => {
    expect(sortRows(rows, null, { valueOf })).toBe(rows);
  });

  it("sorts numbers descending", () => {
    const sorted = sortRows(
      rows,
      { columnId: "slip", direction: "desc" },
      { valueOf },
    );
    expect(ids(sorted)).toEqual(["e", "a", "d", "c", "b"]);
  });

  it("sorts numbers ascending", () => {
    const sorted = sortRows(
      rows,
      { columnId: "slip", direction: "asc" },
      { valueOf },
    );
    expect(ids(sorted)).toEqual(["c", "a", "d", "e", "b"]);
  });

  it("keeps unmeasured rows last in both directions", () => {
    for (const direction of ["asc", "desc"] as const) {
      const sorted = sortRows(
        rows,
        { columnId: "slip", direction },
        { valueOf },
      );
      expect(sorted[sorted.length - 1].id).toBe("b");
    }
  });

  it("is stable, so ties keep their incoming order", () => {
    // "a" and "d" both slip 12 and must not swap.
    const sorted = sortRows(
      rows,
      { columnId: "slip", direction: "desc" },
      { valueOf },
    );
    expect(ids(sorted).filter((id) => id === "a" || id === "d")).toEqual([
      "a",
      "d",
    ]);
  });

  it("does not mutate the input", () => {
    const before = ids(rows);
    sortRows(rows, { columnId: "slip", direction: "asc" }, { valueOf });
    expect(ids(rows)).toEqual(before);
  });

  it("sorts strings by locale, not code point", () => {
    const accented: Row[] = [
      { id: "z", slip: 0, name: "Zalău" },
      { id: "a", slip: 0, name: "Șoseaua" },
      { id: "s", slip: 0, name: "Sibiu" },
    ];
    const sorted = sortRows(
      accented,
      { columnId: "name", direction: "asc" },
      { valueOf, locale: "ro" },
    );
    // Ș sorts right after S in Romanian, ahead of Z — a code-point sort
    // would push it past Z entirely.
    expect(ids(sorted)).toEqual(["s", "a", "z"]);
  });
});

describe("pagination", () => {
  it("counts pages, rounding up", () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(10, 10)).toBe(1);
    expect(pageCount(11, 10)).toBe(2);
    expect(pageCount(34, 10)).toBe(4);
  });

  it("clamps a page index into range", () => {
    expect(clampPage(-2, 34, 10)).toBe(0);
    expect(clampPage(99, 34, 10)).toBe(3);
    expect(clampPage(2, 34, 10)).toBe(2);
  });

  it("slices the requested page", () => {
    const many = Array.from({ length: 34 }, (_, i) => ({
      id: String(i),
      slip: i,
      name: String(i),
    }));
    expect(pageSlice(many, 0, 10)).toHaveLength(10);
    expect(pageSlice(many, 3, 10)).toHaveLength(4);
    expect(ids(pageSlice(many, 1, 10))[0]).toBe("10");
  });

  it("slices the last page when the index runs past the end", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      slip: i,
      name: String(i),
    }));
    expect(ids(pageSlice(many, 9, 10))[0]).toBe("10");
  });

  it("reports 1-based bounds for the page label", () => {
    expect(pageBounds(0, 34, 10)).toEqual({ from: 1, to: 10 });
    expect(pageBounds(3, 34, 10)).toEqual({ from: 31, to: 34 });
    expect(pageBounds(0, 0, 10)).toEqual({ from: 0, to: 0 });
  });
});
