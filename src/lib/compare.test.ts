import { describe, it, expect } from "vitest";
import { leaders } from "./compare";

describe("leaders", () => {
  it("marks the single highest value", () => {
    expect(leaders([100, 50, 25])).toEqual([0]);
    expect(leaders([25, 100, 50])).toEqual([1]);
  });

  it("marks every tied leader when others trail", () => {
    expect(leaders([100, 100, 50])).toEqual([0, 1]);
  });

  it("marks nobody when every measured value ties", () => {
    // Highlighting all of them would look like a finding and say nothing.
    expect(leaders([100, 100])).toEqual([]);
    expect(leaders([7, 7, 7])).toEqual([]);
  });

  it("marks nobody when the best figure is zero", () => {
    // "No country has any tunnels" is not a three-way tie for best tunnels.
    expect(leaders([0, 0, 0])).toEqual([]);
    expect(leaders([0, 0])).toEqual([]);
  });

  it("still marks a leader when the others are zero", () => {
    expect(leaders([10, 0])).toEqual([0]);
  });

  it("ignores unmeasured entries rather than treating them as zero", () => {
    expect(leaders([100, null, 50])).toEqual([0]);
    expect(leaders([null, 100, 50])).toEqual([1]);
  });

  it("marks nobody when fewer than two values are measured", () => {
    // One country with a figure and one without is not a comparison.
    expect(leaders([100, null])).toEqual([]);
    expect(leaders([null, null])).toEqual([]);
    expect(leaders([100])).toEqual([]);
    expect(leaders([])).toEqual([]);
  });

  it("handles negative values without inventing a leader", () => {
    expect(leaders([-5, -10])).toEqual([]);
  });

  it("returns indexes into the original list, not the measured subset", () => {
    expect(leaders([null, null, 5, 1])).toEqual([2]);
  });
});
