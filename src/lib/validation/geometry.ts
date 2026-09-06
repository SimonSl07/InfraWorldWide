/**
 * Structural checks on a project's GeoJSON: every lot has a feature, every
 * feature has a lot, and each line is something the map can actually draw.
 */
import { lineLength } from "../geo";
import type { Project } from "../schema";

export interface GeoFeature {
  /** `_source` records how the geometry was obtained, e.g. "OSM". */
  properties?: { geometryRef?: string; _source?: string } | null;
  geometry?: GeoJSON.Geometry | null;
}

/**
 * Drawn-vs-stated length band. Outside it the geometry and the recorded
 * lengthKm disagree enough that one of them is wrong, but which one is not
 * decidable here: a lot may legitimately draw short (geometry follows one
 * carriageway, or stops at the last mapped vertex) or long (lengthKm counts
 * a single carriageway while the drawn line follows the longer of the two).
 * So this is a WARNING tier, not an error: 83 of 212 committed lots are
 * currently outside it and turning that into a build failure would either
 * block every unrelated change or force a wave of guessed lengthKm edits.
 * The structural checks below (degenerate, out-of-range, duplicate, orphan
 * geometry) are unambiguous and stay errors.
 */
export const LENGTH_RATIO_MIN = 0.85;
export const LENGTH_RATIO_MAX = 1.2;

export interface GeometryReport {
  errors: string[];
  warnings: string[];
}

/** Positions of a line geometry, part by part. */
function lineParts(geometry: GeoJSON.Geometry): number[][][] | null {
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return null;
}

/**
 * Structural checks on one project's GeoJSON file. A feature that is not a
 * drawable line, or that carries a coordinate off the globe, renders nothing
 * on the map while still counting toward every length total, so each of these
 * is an error rather than something to notice later.
 */
export function checkProjectGeometry(
  project: Project,
  geo: { features?: GeoFeature[] },
  geoRel: string,
): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const byRef = new Map<string, GeoFeature>();
  for (const feature of geo.features ?? []) {
    const ref = feature.properties?.geometryRef;
    if (typeof ref !== "string" || ref.length === 0) {
      errors.push(`${geoRel}: feature without a geometryRef property`);
      continue;
    }
    if (byRef.has(ref)) {
      // Two features with one ref: the map draws both, the lot lookup takes
      // whichever the build happens to keep, and lengths double-count.
      errors.push(`${geoRel}: duplicate geometryRef "${ref}"`);
      continue;
    }
    byRef.set(ref, feature);
  }

  // Orphans: geometry nothing points at is invisible on the map but still
  // ships in public/data, and usually means a lot was renamed on one side.
  const lotRefs = new Set(project.lots.map((l) => l.geometryRef));
  for (const ref of byRef.keys()) {
    if (!lotRefs.has(ref)) {
      errors.push(
        `${geoRel}: feature "${ref}" matches no lot in ${project.id}`,
      );
    }
  }

  for (const lot of project.lots) {
    const feature = byRef.get(lot.geometryRef);
    if (!feature) {
      errors.push(
        `${project.id}: lot "${lot.id}" references geometryRef "${lot.geometryRef}" not found in ${geoRel}`,
      );
      continue;
    }
    const where = `${geoRel}: "${lot.geometryRef}"`;
    const geometry = feature.geometry;
    if (!geometry) {
      errors.push(`${where} has no geometry`);
      continue;
    }
    const parts = lineParts(geometry);
    if (!parts) {
      errors.push(
        `${where} is a ${geometry.type}, expected LineString or MultiLineString`,
      );
      continue;
    }

    const positions = parts.reduce((n, p) => n + p.length, 0);
    if (positions < 2 || parts.some((p) => p.length < 2)) {
      errors.push(
        `${where} has ${positions} position(s); a line needs at least 2 per part and draws nothing otherwise`,
      );
      continue;
    }

    let badCoord: string | null = null;
    for (const part of parts) {
      for (const [lng, lat] of part) {
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
          badCoord ??= `non-finite coordinate [${lng}, ${lat}]`;
        } else if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
          badCoord ??= `coordinate out of range [${lng}, ${lat}]`;
        }
      }
    }
    if (badCoord) {
      errors.push(`${where} has a ${badCoord}`);
      continue;
    }

    const drawn = lineLength(geometry);
    const ratio = drawn / lot.lengthKm;
    if (ratio < LENGTH_RATIO_MIN || ratio > LENGTH_RATIO_MAX) {
      warnings.push(
        `${where} draws ${drawn.toFixed(1)} km against lengthKm ${lot.lengthKm} (ratio ${ratio.toFixed(2)})`,
      );
    }
  }

  return { errors, warnings };
}
