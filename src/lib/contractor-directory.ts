import type { ContractorKind } from "./contractors";
import {
  collectLotMetrics,
  metricCountsTowardNetwork,
  rankByContractor,
  type GroupRanking,
  type LotMetric,
  type MetricsOptions,
} from "./rankings";
import type { Contractor, ContractorRegistry, Project } from "./schema";

/**
 * The firms behind the sections, as one directory.
 *
 * `rankByContractor` already produces the league; what it cannot say is what
 * a firm's number is made of. Three things have to be visible or the figure
 * misleads:
 *
 *  - **Role.** `DEFAULT_ROLES` in contractors.ts credits builders only, since
 *    a construction overrun belongs to whoever built the thing. A firm's
 *    design work is real work and is reported here, separately, never folded
 *    into the delivery record.
 *  - **Joint ventures.** A JV's lots are already credited to each member, so
 *    the JV entity is deliberately not a profile of its own: ranking it
 *    beside its members would count one lot two or three times. Instead each
 *    member profile names the ventures it worked through.
 *  - **Identity.** A name that matches no registry entry still ranks, under
 *    an id minted from the spelling, so "Strabag" and "Strabag (lot 1)" are
 *    two firms. `registered` marks those, because it is a gap in
 *    data/contractors.json rather than two companies.
 */

/** A firm needs a track record, not one anecdote, before it is ranked. */
export const MIN_RANKED_LOTS = 2;

export type CreditRole = NonNullable<Contractor["role"]>;

/** Work credited in a role the delivery ranking does not measure. */
export interface RoleCredit {
  metric: LotMetric;
  role: CreditRole;
}

export interface ContractorProfile {
  id: string;
  name: string;
  kind: ContractorKind;
  /** Resolved through data/contractors.json rather than minted from a name. */
  registered: boolean;
  /** Lots credited as builder: exactly what the delivery ranking measures. */
  built: LotMetric[];
  /** Credits in every other role, which the ranking excludes. */
  otherRoles: RoleCredit[];
  /** ISO codes it is credited in, in any role, sorted. */
  countries: string[];
  /** Display names of the joint ventures it built through, sorted. */
  jointVentures: string[];
  /**
   * How many of `built` count toward the network, and the combined length of
   * those. `built` lists every section the firm built, including a tunnel
   * recorded separately but sitting inside a section another project already
   * measures. Counting such a lot again would put a firm's own page at odds
   * with the league printed beside it, so both figures use the same basis.
   */
  countedSections: number;
  km: number;
  /** Its row in the league, or null when it has built nothing. */
  ranking: GroupRanking | null;
  /** Whether it has built enough sections to be worth ranking. */
  ranked: boolean;
}

export interface DirectoryOptions extends MetricsOptions {
  registry: ContractorRegistry;
}

interface Accumulator {
  id: string;
  name: string;
  registered: boolean;
  built: LotMetric[];
  otherRoles: RoleCredit[];
  countries: Set<string>;
  jointVentures: Set<string>;
}

/**
 * One profile per firm named anywhere in the data.
 *
 * The walk resolves each raw contractor string itself rather than reading
 * `LotMetric.contractors`, because the attributed list has already dropped
 * designers and joint ventures, which are two of the three things this page
 * exists to show. The delivery figures still come from `rankByContractor`
 * over the standard attribution, so the league here and the league on the
 * performance page cannot disagree about a firm.
 */
export function buildContractorDirectory(
  projects: Project[],
  options: DirectoryOptions,
): ContractorProfile[] {
  const metrics = collectLotMetrics(projects, options);
  const byLot = new Map(metrics.map((m) => [`${m.projectId}/${m.lotId}`, m]));
  const groups = new Map(rankByContractor(metrics).map((g) => [g.key, g]));
  const known = new Set(options.registry.contractors.map((c) => c.id));

  const firms = new Map<string, Accumulator>();

  for (const project of projects) {
    for (const lot of project.lots) {
      const metric = byLot.get(`${project.id}/${lot.id}`);
      if (!metric) continue;
      // Mirrors attributeLotContractors: a firm named both alone and inside a
      // joint venture on one lot is one credit, not two.
      const seen = new Set<string>();

      for (const contractor of lot.contractors ?? []) {
        // An unlabelled contractor is a builder in practice. The role field is
        // only filled in where a source distinguishes design from execution.
        const role: CreditRole = contractor.role ?? "builder";
        const resolved = options.resolve(contractor.name);
        const ventures = resolved
          .filter((r) => r.kind === "jv")
          .map((r) => r.name);

        for (const firm of resolved) {
          if (firm.kind !== "firm" || seen.has(firm.id)) continue;
          seen.add(firm.id);

          const acc = firms.get(firm.id) ?? {
            id: firm.id,
            name: firm.name,
            registered: known.has(firm.id),
            built: [],
            otherRoles: [],
            countries: new Set<string>(),
            jointVentures: new Set<string>(),
          };
          if (role === "builder") {
            acc.built.push(metric);
            for (const venture of ventures) acc.jointVentures.add(venture);
          } else {
            acc.otherRoles.push({ metric, role });
          }
          acc.countries.add(project.country);
          firms.set(firm.id, acc);
        }
      }
    }
  }

  return [...firms.values()]
    .map((acc) => ({
      id: acc.id,
      name: acc.name,
      kind: "firm" as ContractorKind,
      registered: acc.registered,
      built: acc.built,
      otherRoles: acc.otherRoles,
      countries: [...acc.countries].sort(),
      jointVentures: [...acc.jointVentures].sort(),
      countedSections: acc.built.filter(metricCountsTowardNetwork).length,
      km: acc.built
        .filter(metricCountsTowardNetwork)
        .reduce((sum, m) => sum + m.lengthKm, 0),
      ranking: groups.get(acc.id) ?? null,
      ranked:
        acc.built.filter(metricCountsTowardNetwork).length >= MIN_RANKED_LOTS,
    }))
    .sort(
      (a, b) =>
        b.countedSections - a.countedSections ||
        b.km - a.km ||
        a.name.localeCompare(b.name),
    );
}

/**
 * Firms whose identity was minted from a spelling because no registry entry
 * matched. Every one of them is a line in the same warning `data:validate`
 * prints, and two spellings of one company rank here as two firms.
 */
export function unregisteredFirms(
  profiles: ContractorProfile[],
): ContractorProfile[] {
  return profiles.filter((p) => !p.registered);
}

export function findContractorProfile(
  profiles: ContractorProfile[],
  id: string,
): ContractorProfile | null {
  return profiles.find((p) => p.id === id) ?? null;
}
