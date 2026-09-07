/**
 * Route-projection geometry: robust against dual-carriageway zigzag.
 *
 * The naive "stitch ways by nearest endpoint" approach folds parallel
 * carriageways into out-and-back strands, so slicing between two waypoints
 * can produce lines spanning the whole country. This module instead:
 *
 *   1. builds a reference polyline along the route (from section waypoints),
 *   2. projects every OSM vertex onto it → chainage (distance along route),
 *   3. bins vertices by chainage and averages each bin → clean centerline
 *      (both carriageways collapse into one forward-only line),
 *   4. slices the centerline by chainage range per section.
 *
 * Distances are in degrees (~0.01° ≈ 1.1 km) — fine for route-scale work.
 */

export type LngLat = [number, number];

export interface Reference {
  points: LngLat[];
  /** Cumulative distance at each reference point; cum[0] = 0. */
  cum: number[];
  /** Total reference length. */
  length: number;
}

function dist(a: LngLat, b: LngLat): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function buildReference(waypoints: LngLat[]): Reference {
  if (waypoints.length < 2) throw new Error("reference needs ≥2 waypoints");
  const cum: number[] = [0];
  for (let i = 1; i < waypoints.length; i++) {
    cum.push(cum[i - 1] + dist(waypoints[i - 1], waypoints[i]));
  }
  return { points: waypoints, cum, length: cum[cum.length - 1] };
}

/**
 * Chainage of a point: distance along the reference of its nearest
 * projection. Clamped to [0, ref.length].
 */
export function chainageOf(p: LngLat, ref: Reference): number {
  let bestChainage = 0;
  let bestD = Infinity;
  for (let i = 0; i < ref.points.length - 1; i++) {
    const a = ref.points[i];
    const b = ref.points[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    const t =
      lenSq === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq),
          );
    const proj: LngLat = [a[0] + t * dx, a[1] + t * dy];
    const d = dist(p, proj);
    if (d < bestD) {
      bestD = d;
      bestChainage = ref.cum[i] + t * (ref.cum[i + 1] - ref.cum[i]);
    }
  }
  return bestChainage;
}

function lateralOf(p: LngLat, ref: Reference): number {
  let bestD = Infinity;
  for (let i = 0; i < ref.points.length - 1; i++) {
    const a = ref.points[i];
    const b = ref.points[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    const t =
      lenSq === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq),
          );
    bestD = Math.min(bestD, dist(p, [a[0] + t * dx, a[1] + t * dy]));
  }
  return bestD;
}

/**
 * Collapse unordered OSM vertices into an ordered centerline: bin by
 * chainage, average each bin. Vertices farther than `maxLateral` from the
 * reference (ramps, frontage roads, stray ways) are excluded.
 */
export function centerline(
  vertices: LngLat[],
  ref: Reference,
  binSize = 0.005,
  // Generous by default: fetched ways already belong to the route, and a
  // coarse reference polyline can sit far from the road on big bends.
  // Lower it only to exclude ramps/frontage roads on urban stretches.
  maxLateral = 0.5,
): LngLat[] {
  const bins = new Map<number, { sx: number; sy: number; n: number }>();
  for (const v of vertices) {
    if (lateralOf(v, ref) > maxLateral) continue;
    const c = chainageOf(v, ref);
    const key = Math.round(c / binSize);
    const bin = bins.get(key) ?? { sx: 0, sy: 0, n: 0 };
    bin.sx += v[0];
    bin.sy += v[1];
    bin.n++;
    bins.set(key, bin);
  }
  return [...bins.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, { sx, sy, n }]) => [sx / n, sy / n] as LngLat);
}

/** Sub-polyline of a centerline between the chainages of two waypoints. */
export function sliceByChainage(
  line: LngLat[],
  ref: Reference,
  from: LngLat,
  to: LngLat,
): LngLat[] {
  let c1 = chainageOf(from, ref);
  let c2 = chainageOf(to, ref);
  if (c1 > c2) [c1, c2] = [c2, c1];
  return line.filter((p) => {
    const c = chainageOf(p, ref);
    return c >= c1 && c <= c2;
  });
}

/**
 * Insert extra reference waypoints ("vias") into an ordered waypoint list,
 * each at the position that adds the least total polyline length — i.e.
 * where the route actually bends through the via.
 */
export function insertVias(waypoints: LngLat[], vias: LngLat[]): LngLat[] {
  const out = [...waypoints];
  for (const v of vias) {
    let bestI = 1;
    let bestCost = Infinity;
    // i in [0..out.length]: 0 = prepend, out.length = append, else insert.
    for (let i = 0; i <= out.length; i++) {
      const prev = i > 0 ? out[i - 1] : null;
      const next = i < out.length ? out[i] : null;
      const cost =
        (prev ? dist(prev, v) : 0) +
        (next ? dist(v, next) : 0) -
        (prev && next ? dist(prev, next) : 0);
      if (cost < bestCost) {
        bestCost = cost;
        bestI = i;
      }
    }
    out.splice(bestI, 0, v);
  }
  return out;
}
