import { describe, it, expect } from "vitest";
import {
  createPropertyExpression,
  latest,
} from "@maplibre/maplibre-gl-style-spec";
import {
  ALL_CATEGORIES,
  CATEGORY_COLORS,
  DIMMED,
  MAP_STATUSES,
  STATUS_DASHES,
  categoryColorExpr,
  statusDashExpr,
  countryFillOpacity,
  countryOutlineColor,
  countryOutlineOpacity,
  countryOutlineWidth,
  dimByCountry,
  dimByProject,
  projectFilter,
  pickedFillColor,
  pickedFillOpacity,
  pickedOutlineWidth,
} from "./map-style";
import { DARK_MAP, LIGHT_MAP } from "./map-theme";

/** Every palette a themed expression can be handed. */
const THEMES = [LIGHT_MAP, DARK_MAP];

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
      for (const theme of THEMES) {
        expect(
          validate(countryOutlineColor(selected, theme), "line-color"),
        ).toBeNull();
      }
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

describe("city view paint", () => {
  it("is the plain value when no project is selected", () => {
    expect(dimByProject(0.95, null)).toBe(0.95);
  });

  it("keeps the selected line at full strength and fades the rest", () => {
    expect(dimByProject(0.9, "ro-metro-m5")).toEqual([
      "case",
      ["==", ["get", "projectId"], "ro-metro-m5"],
      0.9,
      0.9 * DIMMED,
    ]);
  });

  it("builds valid opacity expressions", () => {
    for (const selected of [null, "ro-metro-m5"]) {
      for (const full of [0.6, 0.8, 0.95, 1]) {
        expect(validate(dimByProject(full, selected), "line-opacity")).toBeNull();
      }
      expect(
        validate(
          dimByProject(0.95, selected),
          "circle-opacity",
          "paint_circle",
        ),
      ).toBeNull();
    }
  });

  it("builds a filter matching one project", () => {
    expect(projectFilter("ro-metro-m6")).toEqual([
      "==",
      ["get", "projectId"],
      "ro-metro-m6",
    ]);
  });
});

describe("country picker paint", () => {
  const PICKS: string[][] = [[], ["ro"], ["ro", "bg", "rs"]];

  it("builds valid fill expressions for any selection", () => {
    for (const picked of PICKS) {
      for (const hovered of SELECTIONS) {
        expect(
          validate(
            pickedFillOpacity(picked, hovered),
            "fill-opacity",
            "paint_fill",
          ),
        ).toBeNull();
      }
      for (const theme of THEMES) {
        expect(
          validate(pickedFillColor(picked, theme), "fill-color", "paint_fill"),
        ).toBeNull();
      }
      expect(validate(pickedOutlineWidth(picked), "line-width")).toBeNull();
    }
  });

  it("keeps unpicked countries clickable", () => {
    // Same reason as the main map: a zero-opacity fill is not hit-tested,
    // and the whole point of this map is clicking the countries.
    const expression = pickedFillOpacity([], null);
    expect(expression[expression.length - 1]).toBeGreaterThan(0);
  });

  it("matches every picked country, not just the first", () => {
    const expression = pickedFillOpacity(["ro", "bg"], null);
    expect(expression[1]).toEqual([
      "in",
      ["get", "country"],
      ["literal", ["ro", "bg"]],
    ]);
  });
});

describe("category colours", () => {
  it("covers every category", () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_COLORS[category]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("builds a paint expression the spec accepts", () => {
    expect(validate(categoryColorExpr(), "line-color")).toBeNull();
    expect(validate(categoryColorExpr(), "circle-color", "paint_circle")).toBeNull();
  });

  it("maps every category to its own colour, with a fallback", () => {
    const expression = categoryColorExpr("#000000") as unknown as unknown[];
    for (const category of ALL_CATEGORIES) {
      const at = expression.indexOf(category);
      expect(at).toBeGreaterThan(0);
      expect(expression[at + 1]).toBe(CATEGORY_COLORS[category]);
    }
    // A feature with an unknown category still draws rather than vanishing.
    expect(expression[expression.length - 1]).toBe("#000000");
  });
});

describe("map statuses", () => {
  /**
   * Cancelled lots are deliberately not drawn. Nothing asserted that before,
   * so adding "cancelled" to this list would have quietly put abandoned
   * procurements on the map as if they were real road.
   */
  it("excludes cancelled", () => {
    expect(MAP_STATUSES).not.toContain("cancelled");
    expect(MAP_STATUSES).toEqual([
      "opened",
      "under_construction",
      "tendered",
      "planned",
    ]);
  });

  it("builds a dash expression the spec accepts", () => {
    // Built inline in a component at first, where nothing validated it. A
    // malformed dasharray drops the whole layer with no error.
    expect(validate(statusDashExpr(), "line-dasharray")).toBeNull();
  });

  it("keeps the dash expression free of a zoom term", () => {
    // It has to compose with the zoom interpolate already on line-width;
    // a second zoom-dependent interpolate in one layer is the trap.
    expect(JSON.stringify(statusDashExpr())).not.toContain("zoom");
  });

  it("gives a dash to every unopened status and falls back for anything else", () => {
    const expression = statusDashExpr() as unknown as unknown[];
    for (const status of MAP_STATUSES.filter((s) => s !== "opened")) {
      const at = expression.indexOf(status);
      expect(at).toBeGreaterThan(0);
      expect(expression[at + 1]).toEqual(["literal", STATUS_DASHES[status]]);
    }
    // "opened" is drawn solid by its own layer, so it must not appear here.
    expect(expression).not.toContain("opened");
  });

  it("gives every drawn status a dash signature, and only 'opened' is solid", () => {
    for (const status of MAP_STATUSES) {
      expect(status in STATUS_DASHES).toBe(true);
    }
    expect(STATUS_DASHES.opened).toBeUndefined();
    for (const status of MAP_STATUSES.filter((s) => s !== "opened")) {
      expect(STATUS_DASHES[status]?.length).toBeGreaterThan(0);
    }
  });
});

describe("themed colours", () => {
  it("draws the outline and the picker in the palette it is handed", () => {
    // The light values are the defaults, so a caller that passes nothing
    // draws exactly what it drew before the theme existed.
    expect(countryOutlineColor("ro")).toContain(LIGHT_MAP.countryOutline);
    expect(countryOutlineColor("ro", DARK_MAP)).toContain(DARK_MAP.countryOutline);
    expect(countryOutlineColor("ro", DARK_MAP)).toContain(
      DARK_MAP.countryOutlineMuted,
    );
    expect(pickedFillColor(["ro"], DARK_MAP)).toContain(DARK_MAP.pickerPicked);
    expect(pickedFillColor(["ro"], DARK_MAP)).toContain(DARK_MAP.pickerUnpicked);
  });
});
