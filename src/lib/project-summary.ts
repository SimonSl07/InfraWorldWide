import { lotMonths, lotStateAt } from "./country-stats";
import {
  countsTowardNetwork,
  type Funding,
  type LocalizedString,
  type Project,
} from "./schema";

/**
 * Project-level totals and funding, for the project page.
 *
 * The page listed nine sections and never said how long the road was, while
 * the browser card next to it already showed exactly that. The state of each
 * section comes from the same `lotStateAt` the map and the city pages use,
 * so the three cannot disagree about what is open today.
 */

export interface ProjectTotals {
  lots: number;
  /** The project's own length, shared track included. */
  totalKm: number;
  openedKm: number;
  underConstructionKm: number;
  /**
   * How much of `totalKm` another project already measures: track shared
   * with another line, or works inside a section that project records. It
   * stays inside the total, because this project really is that long, and
   * is reported separately because every figure spanning projects drops it.
   *
   * One number for both cases on purpose. A reader reconciling this page
   * against a network total needs the kilometres, not the reason.
   */
  alsoCountedElsewhereKm: number;
}

export function projectTotals(
  project: Project,
  nowMonth: number,
): ProjectTotals {
  const totals: ProjectTotals = {
    lots: project.lots.length,
    totalKm: 0,
    openedKm: 0,
    underConstructionKm: 0,
    alsoCountedElsewhereKm: 0,
  };

  for (const lot of project.lots) {
    totals.totalKm += lot.lengthKm;
    if (!countsTowardNetwork(lot))
      totals.alsoCountedElsewhereKm += lot.lengthKm;

    const state = lotStateAt(lotMonths(lot), nowMonth, nowMonth);
    if (state === "opened") totals.openedKm += lot.lengthKm;
    else if (state === "under_construction") {
      totals.underConstructionKm += lot.lengthKm;
    }
  }

  return totals;
}

export interface FundingShare {
  source: Funding["source"];
  /** Sections that list this source. */
  lots: number;
  /**
   * Kilometres of those sections. A section with two sources counts its full
   * length under each, because the data records which sources paid, never
   * what share each one carried. Summing the column is therefore not the
   * project's length, and the page has to say so.
   */
  km: number;
  /** Distinct details recorded against this source, in first-seen order. */
  details: LocalizedString[];
}

export function fundingBreakdown(project: Project): FundingShare[] {
  const shares = new Map<Funding["source"], FundingShare>();
  const seenDetails = new Map<Funding["source"], Set<string>>();

  for (const lot of project.lots) {
    for (const funding of lot.funding ?? []) {
      let share = shares.get(funding.source);
      if (!share) {
        share = { source: funding.source, lots: 0, km: 0, details: [] };
        shares.set(funding.source, share);
        seenDetails.set(funding.source, new Set());
      }
      share.lots += 1;
      share.km += lot.lengthKm;

      if (funding.detail) {
        // Keyed on the English text, which is the one field the schema
        // requires, so the same detail in both locales is stored once.
        const seen = seenDetails.get(funding.source)!;
        if (!seen.has(funding.detail.en)) {
          seen.add(funding.detail.en);
          share.details.push(funding.detail);
        }
      }
    }
  }

  return [...shares.values()].sort((a, b) => b.km - a.km);
}
