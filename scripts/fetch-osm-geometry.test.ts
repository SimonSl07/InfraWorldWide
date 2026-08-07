import { describe, it, expect } from "vitest";
import { stitch, simplify, slice, nearestVertex } from "./fetch-osm-geometry";

type LngLat = [number, number];

describe("stitch", () => {
  it("joins ways end-to-end in order", () => {
    const ways: LngLat[][] = [
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [2, 0],
      ],
      [
        [2, 0],
        [3, 0],
      ],
    ];
    const strands = stitch(ways);
    expect(strands).toHaveLength(1);
    expect(strands[0]).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });

  it("flips reversed ways", () => {
    const ways: LngLat[][] = [
      [
        [1, 0],
        [0, 0], // stored backwards
      ],
      [
        [1, 0],
        [2, 0],
      ],
    ];
    const strands = stitch(ways);
    expect(strands).toHaveLength(1);
    expect(strands[0][0]).toEqual([0, 0]);
    expect(strands[0][strands[0].length - 1]).toEqual([2, 0]);
  });

  it("keeps disconnected parts as separate strands", () => {
    const ways: LngLat[][] = [
      [
        [0, 0],
        [1, 0],
      ],
      [
        [50, 50],
        [51, 51],
      ],
    ];
    const strands = stitch(ways);
    expect(strands).toHaveLength(2);
  });
});

describe("simplify", () => {
  it("drops collinear points", () => {
    const line: LngLat[] = [
      [0, 0],
      [1, 0.0001],
      [2, 0],
    ];
    expect(simplify(line, 0.001)).toEqual([
      [0, 0],
      [2, 0],
    ]);
  });
  it("keeps significant corners", () => {
    const line: LngLat[] = [
      [0, 0],
      [1, 0.5],
      [2, 0],
    ];
    expect(simplify(line, 0.001)).toHaveLength(3);
  });
  it("passes through short lines", () => {
    const line: LngLat[] = [
      [0, 0],
      [1, 1],
    ];
    expect(simplify(line, 0.001)).toEqual(line);
  });
});

describe("nearestVertex / slice", () => {
  const line: LngLat[] = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ];

  it("finds the nearest vertex", () => {
    expect(nearestVertex(line, [1.1, 0.2])).toBe(1);
    expect(nearestVertex(line, [3.9, -0.1])).toBe(4);
  });

  it("slices between two endpoints regardless of order", () => {
    expect(slice(line, [0.9, 0], [2.9, 0])).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(slice(line, [2.9, 0], [0.9, 0])).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });
});
