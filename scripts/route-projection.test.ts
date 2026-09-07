import { describe, it, expect } from "vitest";
import {
  buildReference,
  centerline,
  chainageOf,
  insertVias,
  sliceByChainage,
} from "./route-projection";

type LngLat = [number, number];

// Straight east-west route reference: x 0→4 at y=0.
const ref = buildReference([
  [0, 0],
  [4, 0],
]);

describe("buildReference", () => {
  it("computes cumulative distances", () => {
    const r = buildReference([
      [0, 0],
      [3, 0],
      [3, 4],
    ]);
    expect(r.cum).toEqual([0, 3, 7]);
  });
});

describe("chainageOf", () => {
  it("projects points onto the reference line", () => {
    expect(chainageOf([1, 0.5], ref)).toBeCloseTo(1, 5);
    expect(chainageOf([3, -0.2], ref)).toBeCloseTo(3, 5);
  });
  it("clamps to the ends", () => {
    expect(chainageOf([-2, 0.1], ref)).toBeCloseTo(0, 5);
    expect(chainageOf([9, 0], ref)).toBeCloseTo(4, 5);
  });
});

describe("centerline", () => {
  it("merges dual carriageways into one forward line", () => {
    // Two parallel carriageways at y=+0.01 and y=-0.01, given as separate
    // strands in arbitrary order (like OSM ways).
    const vertices: LngLat[] = [
      [0, 0.01],
      [1, 0.01],
      [2, 0.01],
      [3, 0.01],
      [4, 0.01],
      [4, -0.01],
      [3, -0.01],
      [2, -0.01],
      [1, -0.01],
      [0, -0.01],
    ];
    const line = centerline(vertices, ref, 0.005);
    // ordered by chainage, averaged to y≈0
    expect(line[0][0]).toBeCloseTo(0, 2);
    expect(line[line.length - 1][0]).toBeCloseTo(4, 2);
    for (const [, lat] of line) expect(Math.abs(lat)).toBeLessThan(0.005);
    // monotonic in x (no zigzag)
    for (let i = 1; i < line.length; i++) {
      expect(line[i][0]).toBeGreaterThanOrEqual(line[i - 1][0]);
    }
  });

  it("handles out-and-back zigzag strands without doubling back", () => {
    // A corrupted stitch: forward along the route, then jumps back.
    const vertices: LngLat[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0], // forward
      [4, 0.002],
      [2, 0.002],
      [0, 0.002], // back along 2nd carriageway
    ];
    const line = centerline(vertices, ref, 0.005);
    expect(line[0][0]).toBeCloseTo(0, 1);
    expect(line[line.length - 1][0]).toBeCloseTo(4, 1);
    for (let i = 1; i < line.length; i++) {
      expect(line[i][0]).toBeGreaterThanOrEqual(line[i - 1][0]);
    }
  });

  it("drops vertices too far from the reference (ramps, stray ways)", () => {
    const vertices: LngLat[] = [
      [1, 0],
      [2, 0],
      [2, 1.5], // 1.5° off-route — excluded by lateral threshold
    ];
    const line = centerline(vertices, ref, 0.005);
    expect(line.every(([, lat]) => Math.abs(lat) < 0.01)).toBe(true);
  });
});

describe("insertVias", () => {
  it("inserts a via where the route bends through it", () => {
    const wps: LngLat[] = [
      [0, 0],
      [4, 0],
    ];
    const out = insertVias(wps, [[2, 1]]);
    expect(out).toEqual([
      [0, 0],
      [2, 1],
      [4, 0],
    ]);
  });
  it("appends a via beyond the end when it extends the route", () => {
    const out = insertVias(
      [
        [0, 0],
        [2, 0],
      ],
      [[5, 0]],
    );
    expect(out).toEqual([
      [0, 0],
      [2, 0],
      [5, 0],
    ]);
  });
});

describe("sliceByChainage", () => {
  it("returns the middle portion between two waypoints", () => {
    const line: LngLat[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ];
    const out = sliceByChainage(line, ref, [0.9, 0.3], [3.1, -0.2]);
    expect(out).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });
  it("works with reversed endpoints", () => {
    const line: LngLat[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ];
    expect(sliceByChainage(line, ref, [3.1, 0], [0.9, 0])).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });
});
