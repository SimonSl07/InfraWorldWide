import { describe, it, expect } from "vitest";
import {
  createPropertyExpression,
  latest,
} from "@maplibre/maplibre-gl-style-spec";
import {
  FUTURE_DASH,
  PROJECTED_HATCH_DASH,
  UNDER_CONSTRUCTION_DASH,
  dashArray,
} from "./line-dashes";

const DASH_SPEC = latest["paint_line"]["line-dasharray"];

describe("line-dasharray patterns", () => {
  it("is a data-driven property, which is the whole problem", () => {
    // If this ever stops being true the wrapping below is merely harmless
    // rather than required, and the comment in line-dashes.ts is stale.
    expect(DASH_SPEC["property-type"]).toBe("cross-faded-data-driven");
  });

  it("rejects a bare array, the way the map used to be written", () => {
    // This is the regression. MapLibre parses the value as an expression,
    // reads 3 as an operator name, drops the property and draws the line
    // solid, with nothing in the UI to say the dash was lost.
    const bare = createPropertyExpression([3, 2.2] as never, DASH_SPEC);
    expect(bare.result).toBe("error");
  });

  it("accepts every pattern the map actually uses", () => {
    for (const [name, value] of [
      ["under construction", UNDER_CONSTRUCTION_DASH],
      ["future", FUTURE_DASH],
      ["projected hatch", PROJECTED_HATCH_DASH],
    ] as const) {
      const parsed = createPropertyExpression(value as never, DASH_SPEC);
      expect(
        parsed.result === "error"
          ? `${name}: ${parsed.value.map((e) => e.message).join("; ")}`
          : "success",
      ).toBe("success");
    }
  });

  it("keeps the pattern itself intact", () => {
    expect(dashArray([2, 1])).toEqual(["literal", [2, 1]]);
  });

  it("carries no zoom term, so it composes with a width interpolate", () => {
    // Only one zoom-dependent interpolate is allowed per expression and it
    // has to be outermost; the width ramp is already that one.
    for (const value of [
      UNDER_CONSTRUCTION_DASH,
      FUTURE_DASH,
      PROJECTED_HATCH_DASH,
    ]) {
      expect(JSON.stringify(value)).not.toContain("zoom");
    }
  });
});
