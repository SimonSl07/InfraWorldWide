import type { ContractorResolver } from "./contractors";
import type { Project } from "./schema";

/**
 * What else a reader of one project page would want next.
 *
 * Contractors first, because "who else did this firm build for" is the
 * question the delivery rankings raise and the project page could not
 * answer. Names are folded through the registry before comparison, or
 * "Astaldi SpA" and "Astaldi" look like two different companies.
 *
 * Geography is deliberately not used: adjacency would have to come from the
 * GeoJSON, which the project page does not load, and "same country and
 * category" is a claim the data supports on its own.
 */

export type RelationReason = "contractor" | "country_category";

export interface RelatedProject {
  project: Project;
  reason: RelationReason;
  /** Canonical firm names in common, when that is the reason. */
  shared: string[];
}

const DEFAULT_LIMIT = 6;

/** Canonical contractor ids on a project, with a display name for each. */
function contractorsOf(
  project: Project,
  resolve: ContractorResolver,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const lot of project.lots) {
    for (const contractor of lot.contractors ?? []) {
      for (const resolved of resolve(contractor.name)) {
        out.set(resolved.id, resolved.name);
      }
    }
  }
  return out;
}

export function relatedProjects(
  project: Project,
  all: Project[],
  options: { resolve: ContractorResolver; limit?: number },
): RelatedProject[] {
  const { resolve, limit = DEFAULT_LIMIT } = options;
  const own = contractorsOf(project, resolve);

  const byContractor: RelatedProject[] = [];
  const byKind: RelatedProject[] = [];

  for (const candidate of all) {
    if (candidate.id === project.id) continue;
    // A container project like ro-tunnels is deliberately kept: its lots
    // carry `partOf` pointing at sections of this very road, which makes it
    // one of the most relevant things a reader could go to next. The marker
    // excludes those lots from cross-project totals, not from navigation.

    const shared = [...contractorsOf(candidate, resolve)]
      .filter(([id]) => own.has(id))
      .map(([, name]) => name)
      .sort();

    if (shared.length > 0) {
      byContractor.push({ project: candidate, reason: "contractor", shared });
    } else if (
      candidate.country === project.country &&
      candidate.category === project.category
    ) {
      byKind.push({
        project: candidate,
        reason: "country_category",
        shared: [],
      });
    }
  }

  // Most firms in common first: two projects built by the same three
  // companies are a stronger link than two that share one.
  byContractor.sort((a, b) => b.shared.length - a.shared.length);

  return [...byContractor, ...byKind].slice(0, limit);
}
