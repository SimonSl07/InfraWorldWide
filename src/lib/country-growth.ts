import { dateYear } from "./schema";
import { ALL_CATEGORIES } from "./map-style";
import type { Category, Project } from "./schema";

/**
 * How a country's network grew, bucketed by decade — the shape behind the
 * country page's chart and the panel's sparkline.
 *
 * Only lots with a recorded opening date count. A section that opened in a
 * year nobody wrote down cannot be placed on a timeline, and spreading it
 * evenly would invent a growth curve.
 */

export interface DecadeBucket {
  /** First year of the decade, e.g. 1990. */
  decade: number;
  byCategory: Record<Category, number>;
  /** Km opened during this decade. */
  km: number;
  /** Km open at the end of this decade, counting every earlier one. */
  cumulativeKm: number;
}

function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

/**
 * Km opened per decade, oldest first.
 *
 * Decades with no openings are included between the first and last so the
 * chart keeps a linear time axis — a gap in construction is information, and
 * dropping the empty buckets would hide it.
 */
export function openedKmByDecade(
  projects: Project[],
  country?: string,
): DecadeBucket[] {
  const buckets = new Map<number, DecadeBucket>();

  const bucket = (decade: number) => {
    let b = buckets.get(decade);
    if (!b) {
      b = {
        decade,
        byCategory: Object.fromEntries(
          ALL_CATEGORIES.map((c) => [c, 0]),
        ) as Record<Category, number>,
        km: 0,
        cumulativeKm: 0,
      };
      buckets.set(decade, b);
    }
    return b;
  };

  for (const project of projects) {
    if (country && project.country !== country) continue;
    for (const lot of project.lots) {
      if (lot.status === "cancelled" || !lot.dates?.opened) continue;
      const b = bucket(decadeOf(dateYear(lot.dates.opened)));
      b.byCategory[project.category] += lot.lengthKm;
      b.km += lot.lengthKm;
    }
  }

  if (buckets.size === 0) return [];

  const decades = [...buckets.keys()].sort((a, b) => a - b);
  const out: DecadeBucket[] = [];
  let cumulative = 0;
  for (let d = decades[0]; d <= decades[decades.length - 1]; d += 10) {
    const b = bucket(d);
    cumulative += b.km;
    b.cumulativeKm = cumulative;
    out.push(b);
  }
  return out;
}

/** The busiest decade, for the "peak building" line on the country page. */
export function peakDecade(buckets: DecadeBucket[]): DecadeBucket | null {
  let best: DecadeBucket | null = null;
  for (const b of buckets) {
    if (b.km > 0 && (best === null || b.km > best.km)) best = b;
  }
  return best;
}
