import { isSharedTrack } from "./schema";
import type { Project } from "./schema";

/**
 * How much track a set of projects lists twice.
 *
 * Two metro lines that through-run the same tunnel each list it, because each
 * line really is that long, so a network total counts it once and drops it
 * from the borrowing line. That leaves a gap between the sum of the lines and
 * the network figure printed beside them, which the reader has no way to
 * explain. These totals are what the footnote that explains it is built from.
 *
 * Cancelled lots are skipped, matching `summarizeCountries`: a cancelled
 * section is in no total, so naming it would describe a difference that is
 * not on the page.
 */
export interface SharedTrackTotal {
  /** Lots whose track belongs to another project. */
  lots: number;
  /** Their combined length, in kilometres. */
  km: number;
}

function empty(): SharedTrackTotal {
  return { lots: 0, km: 0 };
}

export function summarizeSharedTrack(projects: Project[]): SharedTrackTotal {
  const total = empty();
  for (const project of projects) {
    for (const lot of project.lots) {
      if (lot.status === "cancelled" || !isSharedTrack(lot)) continue;
      total.lots += 1;
      total.km += lot.lengthKm;
    }
  }
  return total;
}

/**
 * The same totals per country, keyed by the country of the line that borrows
 * the track. Validation already requires both lines to sit in one country.
 */
export function sharedTrackByCountry(
  projects: Project[],
): Record<string, SharedTrackTotal> {
  const out: Record<string, SharedTrackTotal> = {};
  for (const project of projects) {
    const total = summarizeSharedTrack([project]);
    if (total.lots === 0) continue;
    const current = out[project.country] ?? empty();
    current.lots += total.lots;
    current.km += total.km;
    out[project.country] = current;
  }
  return out;
}
