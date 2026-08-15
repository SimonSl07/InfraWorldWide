import { describe, it, expect } from "vitest";
import { leadersBy } from "./compare-direction";

describe("leadersBy", () => {
  it("defers to leaders() when the highest value wins", () => {
    expect(leadersBy([100, 50, 25], "highest")).toEqual([0]);
    expect(leadersBy([0, 0, 0], "highest")).toEqual([]);
  });

  it("marks the single lowest value", () => {
    expect(leadersBy([100, 50, 25], "lowest")).toEqual([2]);
    expect(leadersBy([25, 100, 50], "lowest")).toEqual([0]);
  });

  it("marks every tied lowest value when others trail", () => {
    expect(leadersBy([5, 5, 40], "lowest")).toEqual([0, 1]);
  });

  it("marks nobody when every measured value ties", () => {
    expect(leadersBy([12, 12], "lowest")).toEqual([]);
    expect(leadersBy([0, 0, 0], "lowest")).toEqual([]);
  });

  it("marks a zero when the others are worse", () => {
    // Unlike the highest direction, zero is a real result here: no delay and
    // no overrun are the best outcomes on those rows, not missing data.
    expect(leadersBy([0, 14], "lowest")).toEqual([0]);
  });

  it("marks negative values, which are early or under budget", () => {
    expect(leadersBy([-6, 3], "lowest")).toEqual([0]);
    expect(leadersBy([-10, -5], "lowest")).toEqual([0]);
  });

  it("ignores unmeasured entries rather than treating them as zero", () => {
    expect(leadersBy([40, null, 10], "lowest")).toEqual([2]);
  });

  it("marks nobody when fewer than two values are measured", () => {
    expect(leadersBy([10, null], "lowest")).toEqual([]);
    expect(leadersBy([10], "lowest")).toEqual([]);
    expect(leadersBy([], "lowest")).toEqual([]);
  });
});
