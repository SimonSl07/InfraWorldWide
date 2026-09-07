import {
  categorySchema,
  dateYear,
  isPartOfAnother,
  isSharedTrack,
  type Category,
  type Project,
} from "./schema";

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

/**
 * Earliest and latest year the data says anything about, counting expected
 * openings so the range covers what is scheduled as well as what is built.
 * Falls back to the current year when nothing is dated.
 */
export function dataYearRange(
  projects: Project[],
  fallbackYear = new Date().getFullYear(),
): { first: number; last: number } {
  const years: number[] = [];
  for (const p of projects) {
    for (const lot of p.lots) {
      for (const date of [
        lot.dates?.announced,
        lot.dates?.constructionStart,
        lot.dates?.opened,
        lot.dates?.expectedOpening,
      ]) {
        if (date) years.push(dateYear(date));
      }
    }
  }
  if (years.length === 0) return { first: fallbackYear, last: fallbackYear };
  return { first: Math.min(...years), last: Math.max(...years) };
}

/**
 * Window for "opened recently", in years. The homepage prints this same
 * constant in the caption, so the figure and its label cannot drift apart.
 */
export const RECENT_YEARS = 20;

export function computeStats(
  projects: Project[],
  nowYear: number,
  recentYears = RECENT_YEARS,
): ProjectStats {
  let openedKm = 0;
  let recentOpenedKm = 0;
  let underConstructionKm = 0;

  for (const p of projects) {
    for (const lot of p.lots) {
      // These headline figures span projects, so anything another project
      // already counts must not be added twice: track a line only borrows
      // (sharedWith), and a structure recorded separately but sitting inside
      // a section its parent already measures (partOf). See AGENTS.md.
      if (isSharedTrack(lot) || isPartOfAnother(lot)) continue;
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

/**
 * What the dataset holds, for the About page. These count records, not
 * kilometres, so `countsTowardNetwork` does not apply: a shared-track lot is
 * still a section somebody curated and cited.
 */
export interface ContentsSummary {
  sectionCount: number;
  /** Projects per category in schema order; categories with none are left out. */
  byCategory: Array<{ category: Category; count: number }>;
  /** Cited sources on projects and on their lots. */
  sourceCount: number;
}

export function summarizeContents(projects: Project[]): ContentsSummary {
  let sectionCount = 0;
  let sourceCount = 0;
  const perCategory = new Map<Category, number>();
  for (const p of projects) {
    sectionCount += p.lots.length;
    sourceCount += p.sources.length;
    perCategory.set(p.category, (perCategory.get(p.category) ?? 0) + 1);
    for (const lot of p.lots) sourceCount += lot.sources?.length ?? 0;
  }
  return {
    sectionCount,
    byCategory: categorySchema.options
      .filter((c) => perCategory.has(c))
      .map((c) => ({ category: c, count: perCategory.get(c) ?? 0 })),
    sourceCount,
  };
}
