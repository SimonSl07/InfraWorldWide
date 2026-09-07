/**
 * Checks on what a project rests on: its cited sources, the licence those
 * sources carry, and whether its contractor names resolve to a firm.
 */
import { createContractorResolver } from "../contractors";
import type { ContractorRegistry, Project } from "../schema";
import type { GeoFeature, GeometryReport } from "./geometry";

/** Reads a project's geometry file, or null when it cannot be read. */
export type GeoReader = (
  project: Project,
) => { features?: GeoFeature[] } | null;

/**
 * Source obligations.
 *
 * The OSM rule is a licence term, not a preference: geometry marked
 * `_source: "OSM"` is ODbL, and ODbL requires attribution. Nothing enforced
 * it, so it is an error. Everything else here is a quality signal and warns:
 * a project resting on one source is thin rather than wrong, and a source
 * with an id nothing points at is only clutter.
 */
export function checkSourceQuality(
  projects: Project[],
  readGeo: GeoReader,
): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const project of projects) {
    const ids = new Set<string>();
    for (const source of project.sources) {
      if (!source.id) continue;
      if (ids.has(source.id)) {
        errors.push(`${project.id}: duplicate source id "${source.id}"`);
      }
      ids.add(source.id);
    }

    const referenced = new Set<string>();
    for (const lot of project.lots) {
      for (const ref of lot.sourceRefs ?? []) {
        referenced.add(ref);
        if (!ids.has(ref)) {
          errors.push(
            `${project.id}: lot "${lot.id}" sourceRef "${ref}" matches no source id`,
          );
        }
      }
    }
    for (const id of ids) {
      if (!referenced.has(id)) {
        warnings.push(
          `${project.id}: source id "${id}" is referenced by no lot; drop the id or point a lot at it`,
        );
      }
    }

    if (project.sources.length < 2) {
      warnings.push(
        `${project.id}: rests on ${project.sources.length} source, so nothing corroborates it`,
      );
    }

    const geo = readGeo(project);
    const fromOsm = (geo?.features ?? []).some(
      (f) => f.properties?._source === "OSM",
    );
    if (fromOsm) {
      const cites = project.sources.some(
        (s) =>
          s.url.includes("openstreetmap.org") ||
          /openstreetmap|\bosm\b/i.test(s.title),
      );
      if (!cites) {
        errors.push(
          `${project.id}: geometry is OSM-derived (ODbL) but no source cites OpenStreetMap`,
        );
      }
    }
  }
  return { errors, warnings };
}

/**
 * A contractor name written on a lot should resolve to a registry entry.
 *
 * Unregistered spellings do not vanish (the resolver mints a synthetic
 * identity), but they do not merge either: "Strabag" and "Strabag (lot 1)"
 * rank as two firms. Warning rather than error, because registering a firm
 * is a sourcing job of its own and 82 names are currently unregistered.
 * One line per distinct name, so each line is one registry entry to add.
 */
export function checkLotContractors(
  registry: ContractorRegistry | null,
  projects: Project[],
): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!registry) return { errors, warnings };

  const known = new Set(registry.contractors.map((c) => c.id));
  const resolve = createContractorResolver(registry);
  const unresolved = new Map<string, number>();

  for (const project of projects) {
    for (const lot of project.lots) {
      for (const contractor of lot.contractors ?? []) {
        const misses = resolve(contractor.name).filter(
          (r) => r.kind === "firm" && !known.has(r.id),
        );
        if (misses.length > 0) {
          unresolved.set(
            contractor.name,
            (unresolved.get(contractor.name) ?? 0) + 1,
          );
        }
      }
    }
  }
  for (const [name, count] of [...unresolved].sort()) {
    warnings.push(
      `data/contractors.json: "${name}" (${count} lot${count === 1 ? "" : "s"}) has no registry entry, so it cannot merge with other spellings`,
    );
  }
  return { errors, warnings };
}
