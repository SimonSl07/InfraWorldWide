import { lotMonths, lotStateAt } from "./country-stats";
import { countsTowardNetwork } from "./schema";
import type { Corridor, CorridorTable, Project } from "./schema";

/**
 * Transport corridors: the axis these three countries are actually
 * comparable on.
 *
 * A corridor crosses borders by construction, so every total here spans
 * projects and applies `countsTowardNetwork` for the same reason the country
 * league does.
 *
 * Two designation schemes are kept apart on purpose. The Pan-European
 * (Helsinki) corridors are how most of these projects were described when
 * they were planned, and 13 of the 16 cited sources use those terms; TEN-T
 * is what EU money is allocated on today. Presenting one as the other would
 * rewrite what the sources say, so the UI groups by scheme and never merges.
 */

/** TEN-T first: the designation in force now, with the historic one after. */
const SCHEME_ORDER: Corridor["scheme"][] = ["ten-t", "pan-european"];

export interface CorridorCountryTotals {
  country: string;
  projects: number;
  openedKm: number;
  underConstructionKm: number;
  plannedKm: number;
}

export interface CorridorSummary {
  projects: number;
  countries: number;
  openedKm: number;
  underConstructionKm: number;
  plannedKm: number;
  /** Everything recorded along it, whatever state it is in. */
  totalKm: number;
  /** Per country, longest open network first. */
  byCountry: CorridorCountryTotals[];
}

export interface CorridorEntry {
  id: string;
  corridor: Corridor;
  summary: CorridorSummary;
}

/** Projects that state membership of a corridor, in dataset order. */
export function corridorProjects(projects: Project[], id: string): Project[] {
  return projects.filter((p) => p.corridors?.includes(id));
}

export function corridorSummary(
  projects: Project[],
  id: string,
  nowMonth: number,
): CorridorSummary {
  const byCountry = new Map<string, CorridorCountryTotals>();
  const members = corridorProjects(projects, id);

  for (const project of members) {
    const totals = byCountry.get(project.country) ?? {
      country: project.country,
      projects: 0,
      openedKm: 0,
      underConstructionKm: 0,
      plannedKm: 0,
    };
    totals.projects += 1;

    for (const lot of project.lots) {
      // A corridor total spans projects, so a lot another project already
      // measures would put the same kilometres on the corridor twice.
      if (!countsTowardNetwork(lot)) continue;
      const state = lotStateAt(lotMonths(lot), nowMonth, nowMonth);
      if (state === "opened") totals.openedKm += lot.lengthKm;
      else if (state === "under_construction") {
        totals.underConstructionKm += lot.lengthKm;
      } else if (state === "planned") totals.plannedKm += lot.lengthKm;
    }

    byCountry.set(project.country, totals);
  }

  const countries = [...byCountry.values()].sort(
    (a, b) => b.openedKm - a.openedKm,
  );
  const sum = (pick: (c: CorridorCountryTotals) => number) =>
    countries.reduce((total, c) => total + pick(c), 0);

  const openedKm = sum((c) => c.openedKm);
  const underConstructionKm = sum((c) => c.underConstructionKm);
  const plannedKm = sum((c) => c.plannedKm);

  return {
    projects: members.length,
    countries: countries.length,
    openedKm,
    underConstructionKm,
    plannedKm,
    totalKm: openedKm + underConstructionKm + plannedKm,
    byCountry: countries,
  };
}

/**
 * Every corridor in the table, grouped by scheme and named alphabetically
 * inside it.
 *
 * A corridor no project claims is kept with a count of zero. The table is
 * the list of designations that exist; one with nothing under it says the
 * dataset has a gap there, which is worth showing rather than hiding.
 */
export function listCorridors(
  table: CorridorTable,
  projects: Project[],
  nowMonth: number,
): CorridorEntry[] {
  return Object.entries(table.corridors)
    .map(([id, corridor]) => ({
      id,
      corridor,
      summary: corridorSummary(projects, id, nowMonth),
    }))
    .sort((a, b) => {
      const scheme =
        SCHEME_ORDER.indexOf(a.corridor.scheme) -
        SCHEME_ORDER.indexOf(b.corridor.scheme);
      // Reversed, so the index reads Pan-European first (there are more of
      // them and they are the older designation) while a project's own
      // badges lead with TEN-T. Both orders are deliberate.
      if (scheme !== 0) return -scheme;
      return a.corridor.name.en.localeCompare(b.corridor.name.en);
    });
}

/** A project's corridors, resolved against the table. Unknown keys drop. */
export function corridorsOfProject(
  project: Project,
  table: CorridorTable,
): CorridorEntry[] {
  return (project.corridors ?? [])
    .flatMap((id) => {
      const corridor = table.corridors[id];
      return corridor ? [{ id, corridor }] : [];
    })
    .sort(
      (a, b) =>
        SCHEME_ORDER.indexOf(a.corridor.scheme) -
        SCHEME_ORDER.indexOf(b.corridor.scheme),
    )
    .map(({ id, corridor }) => ({
      id,
      corridor,
      // The badge on a project page names the corridor; it does not restate
      // the corridor's own totals, so this stays empty rather than making
      // every project page compute six corridor summaries.
      summary: {
        projects: 0,
        countries: 0,
        openedKm: 0,
        underConstructionKm: 0,
        plannedKm: 0,
        totalKm: 0,
        byCountry: [],
      },
    }));
}
