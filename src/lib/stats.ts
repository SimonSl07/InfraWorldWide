import { dateYear, type Project } from "./schema";

/** Headline statistics for the landing page — pure, unit-tested. */
export interface ProjectStats {
  projectCount: number;
  countryCount: number;
  /** Total km of lots with status "opened". */
  openedKm: number;
  /** Km opened in the last `recentYears` years (by opened year). */
  recentOpenedKm: number;
  /** Km currently under construction. */
  underConstructionKm: number;
}

export function computeStats(
  projects: Project[],
  nowYear: number,
  recentYears = 20,
): ProjectStats {
  let openedKm = 0;
  let recentOpenedKm = 0;
  let underConstructionKm = 0;

  for (const p of projects) {
    for (const lot of p.lots) {
      if (lot.status === "opened" && lot.dates?.opened) {
        openedKm += lot.lengthKm;
        if (dateYear(lot.dates.opened) >= nowYear - recentYears) {
          recentOpenedKm += lot.lengthKm;
        }
      } else if (lot.status === "under_construction") {
        underConstructionKm += lot.lengthKm;
      }
    }
  }

  return {
    projectCount: projects.length,
    countryCount: new Set(projects.map((p) => p.country)).size,
    openedKm,
    recentOpenedKm,
    underConstructionKm,
  };
}
