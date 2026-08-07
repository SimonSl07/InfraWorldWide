import type { Category, LocalizedString, Project } from "./schema";

export interface Opening {
  projectId: string;
  projectName: LocalizedString;
  lotId: string;
  lotName: LocalizedString;
  category: Category;
  country: string;
  lengthKm: number;
  /** The opened date (past) or expectedOpening date (scheduled). */
  date: string;
}

/** Compare partial ISO dates ("2012" < "2012-06" < "2012-06-15"). */
function compareDates(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Flattens all lots into an openings timeline (130km.ro-style calendar):
 * past openings newest-first, scheduled openings soonest-first.
 */
export function getOpenings(projects: Project[]): {
  past: Opening[];
  scheduled: Opening[];
} {
  const past: Opening[] = [];
  const scheduled: Opening[] = [];

  for (const p of projects) {
    for (const lot of p.lots) {
      const base = {
        projectId: p.id,
        projectName: p.name,
        lotId: lot.id,
        lotName: lot.name,
        category: p.category,
        country: p.country,
        lengthKm: lot.lengthKm,
      };
      if (lot.dates?.opened) {
        past.push({ ...base, date: lot.dates.opened });
      } else if (lot.dates?.expectedOpening) {
        scheduled.push({ ...base, date: lot.dates.expectedOpening });
      }
    }
  }

  past.sort((a, b) => compareDates(b.date, a.date));
  scheduled.sort((a, b) => compareDates(a.date, b.date));
  return { past, scheduled };
}
