import { describe, it, expect } from "vitest";
import {
  BASELINE_YEARS,
  baselineMonth,
  readCompareBaseline,
} from "./compare-years";
import { toMonthIndex } from "./map-filters";

const JAN_2010 = toMonthIndex(2010, 1);
const JAN_2005 = toMonthIndex(2005, 1);
const SEP_2026 = toMonthIndex(2026, 9);

describe("baselineMonth", () => {
  it("applies the offset while nothing is pinned", () => {
    expect(baselineMonth(SEP_2026, { years: 5, pinned: null })).toBe(
      toMonthIndex(2021, 9),
    );
  });

  it("uses the pinned month regardless of the offset", () => {
    expect(baselineMonth(SEP_2026, { years: 5, pinned: JAN_2005 })).toBe(
      JAN_2005,
    );
  });

  it("keeps a pinned month still as the viewed month moves", () => {
    const baseline = { years: 5, pinned: JAN_2005 };
    expect(baselineMonth(SEP_2026, baseline)).toBe(
      baselineMonth(JAN_2010, baseline),
    );
  });

  // Both timelines run the whole range, so the left thumb can be dragged
  // past the right one.
  it("never reports a month later than the one on the right", () => {
    expect(baselineMonth(JAN_2005, { years: 5, pinned: SEP_2026 })).toBe(
      JAN_2005,
    );
  });

  it("restores the pinned month once the right thumb moves back past it", () => {
    const baseline = { years: 5, pinned: JAN_2010 };
    expect(baselineMonth(JAN_2005, baseline)).toBe(JAN_2005);
    expect(baselineMonth(SEP_2026, baseline)).toBe(JAN_2010);
  });
});

describe("readCompareBaseline", () => {
  // The bug this replaces: cmp was read against today rather than against
  // the month in the same link, so a link to a past date reopened on a
  // baseline nobody chose.
  it("restores the pair a past-dated link encoded", () => {
    const baseline = readCompareBaseline(JAN_2005, JAN_2010, 5);
    expect(baselineMonth(JAN_2010, baseline)).toBe(JAN_2005);
  });

  it("restores an exact offset as a preset, so it keeps following the slider", () => {
    expect(readCompareBaseline(JAN_2005, JAN_2010, 1)).toEqual({
      years: 5,
      pinned: null,
    });
  });

  it("pins an offset that is not one of the presets", () => {
    const cmp = toMonthIndex(2007, 1);
    expect(readCompareBaseline(cmp, JAN_2010, 5)).toEqual({
      years: 5,
      pinned: cmp,
    });
  });

  it("round-trips every preset at a month that is not today", () => {
    for (const years of BASELINE_YEARS) {
      const cmp = JAN_2010 - years * 12;
      expect(readCompareBaseline(cmp, JAN_2010, 5)).toEqual({
        years,
        pinned: null,
      });
    }
  });
});
