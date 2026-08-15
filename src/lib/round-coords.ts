/**
 * Coordinate precision for the emitted map artifacts.
 *
 * OSM exports carry up to 15 decimal places, which is a tenth of a
 * nanometre: every one of those digits is transferred, parsed and thrown
 * away by the renderer. Six decimals is about 0.1 m at the equator, finer
 * than the source geometry is surveyed and far finer than anything a line
 * a few pixels wide can show.
 */
export const COORD_DECIMALS = 6;

/** Rounds one ordinate, half away from zero so signs behave the same. */
export function roundCoordinate(
  value: number,
  decimals: number = COORD_DECIMALS,
): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  const rounded = Math.round(Math.abs(value) * factor) / factor;
  // Never hand back -0: it is a different value to every equality check
  // even though JSON.stringify prints it as "0".
  if (rounded === 0) return 0;
  return value < 0 ? -rounded : rounded;
}

/** A GeoJSON coordinate at any nesting depth: a number or a list of them. */
type Coordinates = number | Coordinates[];

function roundNested(value: Coordinates, decimals: number): Coordinates {
  return typeof value === "number"
    ? roundCoordinate(value, decimals)
    : value.map((inner) => roundNested(inner, decimals));
}

/**
 * A copy of `geometry` with every coordinate rounded, whatever its type.
 * Nesting depth varies by geometry type (Point through MultiPolygon), so
 * the walk is generic rather than a switch. The input is left untouched.
 */
export function roundGeometry<T>(
  geometry: T,
  decimals: number = COORD_DECIMALS,
): T {
  if (!geometry || typeof geometry !== "object") return geometry;
  const source = geometry as {
    coordinates?: Coordinates;
    geometries?: unknown[];
  };
  if (Array.isArray(source.geometries)) {
    return {
      ...geometry,
      geometries: source.geometries.map((g) => roundGeometry(g, decimals)),
    };
  }
  if (source.coordinates === undefined) return geometry;
  return { ...geometry, coordinates: roundNested(source.coordinates, decimals) };
}
