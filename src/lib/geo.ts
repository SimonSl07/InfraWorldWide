import type { Feature, FeatureCollection, Position } from "geojson";

export type BBox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

function* positions(geometry: GeoJSON.Geometry): Generator<Position> {
  switch (geometry.type) {
    case "Point":
      yield geometry.coordinates;
      break;
    case "MultiPoint":
    case "LineString":
      yield* geometry.coordinates;
      break;
    case "MultiLineString":
    case "Polygon":
      for (const line of geometry.coordinates) yield* line;
      break;
    case "MultiPolygon":
      for (const poly of geometry.coordinates)
        for (const line of poly) yield* line;
      break;
    case "GeometryCollection":
      for (const g of geometry.geometries) yield* positions(g);
      break;
  }
}

/** Bounding box of any number of geometries; null when none has coordinates. */
function boundsOf(geometries: Iterable<GeoJSON.Geometry>): BBox | null {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  let found = false;
  for (const geometry of geometries) {
    for (const [lng, lat] of positions(geometry)) {
      found = true;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return found ? [minLng, minLat, maxLng, maxLat] : null;
}

/** Bounding box of a single geometry; null when it has no coordinates. */
export function geometryBounds(
  geometry: GeoJSON.Geometry | null | undefined,
): BBox | null {
  return geometry ? boundsOf([geometry]) : null;
}

/** Bounding box of a feature collection; null when empty. */
export function geojsonBounds(fc: FeatureCollection): BBox | null {
  return boundsOf(
    fc.features.flatMap((f) => (f.geometry ? [f.geometry] : [])),
  );
}

/** Features belonging to one project. */
export function featuresForProject(
  fc: FeatureCollection,
  projectId: string,
): Feature[] {
  return fc.features.filter((f) => f.properties?.projectId === projectId);
}

/** Middle vertex of a line by vertex count (fine for short bridge lines). */
export function lineMidpoint(coords: Position[]): Position | null {
  if (coords.length === 0) return null;
  return coords[Math.floor((coords.length - 1) / 2)];
}

/** Distance from a point to a segment, in degrees (good enough for comparison). */
function pointToSegment(p: Position, a: Position, b: Position): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Minimum distance from a point to any part of a feature's geometry. */
export function distanceToFeature(p: Position, feature: Feature): number {
  let min = Infinity;
  if (!feature.geometry) return min;
  let prev: Position | null = null;
  for (const pos of positions(feature.geometry)) {
    if (prev) min = Math.min(min, pointToSegment(p, prev, pos));
    else if (feature.geometry.type === "Point") min = Math.min(min, Math.hypot(p[0] - pos[0], p[1] - pos[1]));
    prev = pos;
  }
  return min;
}

/**
 * Of several hit-tested features (overlapping click radii), pick the one
 * whose geometry is closest to the click point — not just the topmost layer.
 */
export function nearestFeature<T extends Feature>(
  features: T[],
  point: Position,
): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const f of features) {
    const d = distanceToFeature(point, f);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}
