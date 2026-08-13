import { describe, it, expect } from "vitest";
import type { Feature } from "geojson";
import { hoveredCountry, resolveMapClick, toggleSelection } from "./map-click";

function lot(id: string, coords: [number, number][]): Feature {
  return {
    type: "Feature",
    properties: { lotId: id, projectId: "ro-a1", country: "ro" },
    geometry: { type: "LineString", coordinates: coords },
  };
}

function outline(code: string): Feature {
  return {
    type: "Feature",
    properties: { country: code, bbox: [20, 43, 30, 48] },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [20, 43],
          [30, 43],
          [30, 48],
          [20, 48],
          [20, 43],
        ],
      ],
    },
  };
}

describe("resolveMapClick", () => {
  const point: [number, number] = [25, 45];

  it("returns nothing when the click hit nothing", () => {
    expect(resolveMapClick([], point)).toEqual({ kind: "none" });
  });

  it("selects the country when only the outline was hit", () => {
    expect(resolveMapClick([outline("ro")], point)).toEqual({
      kind: "country",
      code: "ro",
    });
  });

  /**
   * The country fill spans the whole map, so it is under every road. If it
   * won, no lot would ever be clickable again.
   */
  it("prefers a lot over the country beneath it", () => {
    const result = resolveMapClick(
      [outline("ro"), lot("l1", [[25, 45], [26, 45]])],
      point,
    );
    expect(result).toEqual({ kind: "lot", feature: expect.anything() });
    expect(
      result.kind === "lot" ? result.feature.properties!.lotId : null,
    ).toBe("l1");
  });

  it("picks the nearest lot when hit areas overlap", () => {
    const near = lot("near", [[25, 45.01], [26, 45.01]]);
    const far = lot("far", [[25, 45.4], [26, 45.4]]);
    const result = resolveMapClick([outline("ro"), far, near], point);
    expect(
      result.kind === "lot" ? result.feature.properties!.lotId : null,
    ).toBe("near");
  });

  it("ignores a feature that is neither a lot nor an outline", () => {
    const stray: Feature = {
      type: "Feature",
      properties: { label: "somewhere" },
      geometry: { type: "Point", coordinates: [25, 45] },
    };
    expect(resolveMapClick([stray], point)).toEqual({ kind: "none" });
  });
});

describe("toggleSelection", () => {
  it("selects a new thing", () => {
    expect(toggleSelection(null, "ro-metro-m5")).toBe("ro-metro-m5");
    expect(toggleSelection("ro-metro-m6", "ro-metro-m5")).toBe("ro-metro-m5");
  });

  /** Two metro lines can leave almost no empty map to click between them. */
  it("clears when the selected thing is clicked again", () => {
    expect(toggleSelection("ro-metro-m5", "ro-metro-m5")).toBeNull();
  });

  it("clears on a click that hit nothing", () => {
    expect(toggleSelection("ro-metro-m5", null)).toBeNull();
    expect(toggleSelection(null, null)).toBeNull();
  });
});

describe("hoveredCountry", () => {
  it("reports the outline under the pointer", () => {
    expect(hoveredCountry([outline("bg")])).toBe("bg");
  });

  it("is null over open sea", () => {
    expect(hoveredCountry([])).toBeNull();
  });

  /**
   * Lot features carry a country too, but hovering a road should not tint
   * the country — the tint tracks the fill the pointer is actually over.
   */
  it("is null when only a lot is under the pointer", () => {
    expect(hoveredCountry([lot("l1", [[25, 45], [26, 45]])])).toBeNull();
  });
});
