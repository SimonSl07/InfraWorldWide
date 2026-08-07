import { describe, it, expect } from "vitest";
import { geojsonBounds, featuresForProject, nearestFeature, distanceToFeature } from "./geo";
import type { FeatureCollection } from "geojson";

const fc: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { projectId: "ro-a1" },
      geometry: {
        type: "LineString",
        coordinates: [
          [26.0, 44.5],
          [27.0, 45.0],
        ],
      },
    },
    {
      type: "Feature",
      properties: { projectId: "ro-a3" },
      geometry: { type: "Point", coordinates: [25.5, 45.8] },
    },
  ],
};

describe("geojsonBounds", () => {
  it("computes the bounding box across feature types", () => {
    expect(geojsonBounds(fc)).toEqual([25.5, 44.5, 27.0, 45.8]);
  });
  it("returns null for an empty collection", () => {
    expect(geojsonBounds({ type: "FeatureCollection", features: [] })).toBeNull();
  });
});

describe("featuresForProject", () => {
  it("filters features by projectId", () => {
    const features = featuresForProject(fc, "ro-a1");
    expect(features).toHaveLength(1);
    expect(features[0].geometry.type).toBe("LineString");
  });
});

describe("nearestFeature", () => {
  const lineA = {
    type: "Feature" as const,
    properties: { lotId: "a" },
    geometry: {
      type: "LineString" as const,
      coordinates: [
        [0, 0],
        [4, 0],
      ],
    },
  };
  const lineB = {
    type: "Feature" as const,
    properties: { lotId: "b" },
    geometry: {
      type: "LineString" as const,
      coordinates: [
        [0, 0.01],
        [4, 0.01],
      ],
    },
  };

  it("picks the geometrically closer line, not the first in the list", () => {
    // click nearer B even though A comes first in the hit list
    expect(nearestFeature([lineA, lineB], [2, 0.008])?.properties?.lotId).toBe("b");
    expect(nearestFeature([lineA, lineB], [2, 0.001])?.properties?.lotId).toBe("a");
  });

  it("measures distance to segments, not just vertices", () => {
    // midpoint of A, far from its vertices but on the segment
    expect(distanceToFeature([2, 0.002], lineA)).toBeCloseTo(0.002, 5);
  });

  it("returns null for an empty list", () => {
    expect(nearestFeature([], [0, 0])).toBeNull();
  });
});
