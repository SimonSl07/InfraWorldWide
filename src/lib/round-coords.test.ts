import { describe, it, expect } from "vitest";
import { COORD_DECIMALS, roundCoordinate, roundGeometry } from "./round-coords";

describe("roundCoordinate", () => {
  it("keeps six decimals by default", () => {
    expect(roundCoordinate(26.1234567891234)).toBe(26.123457);
    expect(roundCoordinate(44.4)).toBe(44.4);
    expect(COORD_DECIMALS).toBe(6);
  });

  it("rounds negative values symmetrically with positive ones", () => {
    expect(roundCoordinate(-0.1234567, 6)).toBe(-0.123457);
    expect(roundCoordinate(-23.987654321, 6)).toBe(-23.987654);
    expect(roundCoordinate(-0.0000001, 6)).toBe(0);
  });

  it("honours an explicit precision", () => {
    expect(roundCoordinate(26.1234567891234, 2)).toBe(26.12);
    expect(roundCoordinate(26.1234567891234, 0)).toBe(26);
  });

  it("does not introduce float noise in the shortest representation", () => {
    // The point of the exercise: the emitted JSON must be short.
    expect(JSON.stringify(roundCoordinate(23.123456789012345))).toBe(
      "23.123457",
    );
    expect(JSON.stringify(roundCoordinate(0.1 + 0.2))).toBe("0.3");
  });

  it("passes non-finite values through untouched", () => {
    expect(roundCoordinate(NaN)).toBeNaN();
    expect(roundCoordinate(Infinity)).toBe(Infinity);
  });
});

describe("roundGeometry", () => {
  it("rounds a LineString", () => {
    expect(
      roundGeometry({
        type: "LineString",
        coordinates: [
          [26.1234567891, 44.4321987654],
          [26.2, 44.5],
        ],
      }),
    ).toEqual({
      type: "LineString",
      coordinates: [
        [26.123457, 44.432199],
        [26.2, 44.5],
      ],
    });
  });

  it("rounds every ring of a MultiPolygon", () => {
    const rounded = roundGeometry({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [20.0000001, 43.9999999],
            [20.5555555555, 44.1111111111],
            [20.0000001, 43.9999999],
          ],
        ],
      ],
    }) as { coordinates: number[][][][] };
    expect(rounded.coordinates[0][0]).toEqual([
      [20, 44],
      [20.555556, 44.111111],
      [20, 44],
    ]);
  });

  it("rounds a Point and leaves other members alone", () => {
    expect(
      roundGeometry({ type: "Point", coordinates: [26.10254999, 44.4267774] }),
    ).toEqual({ type: "Point", coordinates: [26.10255, 44.426777] });
  });

  it("recurses into a GeometryCollection", () => {
    const rounded = roundGeometry({
      type: "GeometryCollection",
      geometries: [{ type: "Point", coordinates: [1.23456789, 2.3456789] }],
    }) as { geometries: Array<{ coordinates: number[] }> };
    expect(rounded.geometries[0].coordinates).toEqual([1.234568, 2.345679]);
  });

  it("returns null and undefined unchanged", () => {
    expect(roundGeometry(null)).toBeNull();
    expect(roundGeometry(undefined)).toBeUndefined();
  });

  it("does not mutate its input", () => {
    const input = {
      type: "LineString" as const,
      coordinates: [[26.1234567891, 44.4321987654]],
    };
    roundGeometry(input);
    expect(input.coordinates[0][0]).toBe(26.1234567891);
  });
});
