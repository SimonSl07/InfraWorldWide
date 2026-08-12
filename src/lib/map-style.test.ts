import { describe, it, expect } from "vitest";
import {
  createPropertyExpression,
  latest,
} from "@maplibre/maplibre-gl-style-spec";
import {
  ALL_CATEGORIES,
  CATEGORY_COLORS,
  DIMMED,
  countryFillOpacity,
  countryOutlineColor,
  countryOutlineOpacity,
  countryOutlineWidth,
  dimByCountry,
} from "./map-style";

/**
 * MapLibre validates paint expressions at runtime and silently drops the
 * whole layer when one is malformed — there is no type error and no test
 * failure, just a layer that never appears. So every expression these
 * helpers build is validated here against the same spec the map uses.
 *
 * The rule that caught this in practice: only one zoom-dependent
 * "interpolate" may appear per expression, and it must be outermost. Nesting
 * one inside a "case" type-checks perfectly and renders nothing.
 */

type PropertySpec = Parameters<typeof createPropertyExpression>[1];

function validate(expression: unknown, property: string, layer = "paint_line") {
  const spec = (
    latest as unknown as Record<string, Record<string, PropertySpec>>
  )[layer][property];
  const result = createPropertyExpression(expression as never, spec);
  return result.result === "success"
    ? null
    : result.value.map((e) => e.message).join("; ");
}

const SELECTIONS: Array<string | null> = [null, "ro"];

describe("dimByCountry", () => {
  it("is the plain value when no country is selected", () => {
    expect(dimByCountry(0.95, null)).toBe(0.95);
  });

  it("keeps the selected country at full strength and fades the rest", () => {
    expect(dimByCountry(0.5, "ro")).toEqual([
      "case",
      ["==", ["get", "country"], "ro"],
      0.5,
      0.5 * DIMMED,
    ]);
  });

  it("builds a valid line-opacity expression", () => {
    for (const selected of SELECTIONS) {
      for (const full of [0.4, 0.55, 0.7, 0.95, 1]) {
        expect(validate(dimByCountry(full, selected), "line-opacity")).toBeNull();
      }
    }
  });

  it("builds a valid circle-opacity expression", () => {
    for (const selected of SELECTIONS) {
      expect(
        validate(dimByCountry(0.95, selected), "circle-opacity", "paint_circle"),
      ).toBeNull();
    }
  });
});

describe("country layer paint", () => {
  it("builds a valid fill-opacity expression", () => {
    for (const selected of SELECTIONS) {
      for (const hovered of SELECTIONS) {
        expect(
          validate(
            countryFillOpacity(selected, hovered),
            "fill-opacity",
            "paint_fill",
          ),
        ).toBeNull();
      }
    }
  });

  it("keeps the fill clickable when nothing is selected", () => {
    // A fully transparent fill is not hit-tested, so the floor must be > 0.
    const expression = countryFillOpacity(null, null);
    expect(expression[expression.length - 1]).toBeGreaterThan(0);
  });

  it("builds valid outline expressions", () => {
    for (const selected of SELECTIONS) {
      expect(validate(countryOutlineOpacity(selected), "line-opacity")).toBeNull();
      expect(validate(countryOutlineColor(selected), "line-color")).toBeNull();
      expect(validate(countryOutlineWidth(selected), "line-width")).toBeNull();
    }
  });

  it("rejects the zoom interpolate nested in a case, as MapLibre does", () => {
    // Pins the reason countryOutlineOpacity is shaped the way it is.
    const nested = [
      "case",
      ["==", ["get", "country"], "ro"],
      ["interpolate", ["linear"], ["zoom"], 4, 0.9, 9, 0.2],
      ["interpolate", ["linear"], ["zoom"], 4, 0.35, 8, 0],
    ];
    expect(validate(nested, "line-opacity")).toMatch(/interpolate/);
  });
});

describe("category colours", () => {
  it("covers every category", () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_COLORS[category]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
