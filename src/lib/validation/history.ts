/**
 * Checks that a lot's status, its dates and its event history all describe
 * the same world.
 */
import { statusFromEvents, type Project } from "../schema";
import type { GeometryReport } from "./geometry";

/**
 * Whether a partial ISO date has already passed, compared at the precision
 * it was written with. A year-only deadline of "2026" is not missed in
 * August 2026: the year still has months to run. Comparing "2026" against
 * "2026-08-14" as strings would report eight overdue lots that are not.
 */
export function hasElapsed(date: string, today: string): boolean {
  const n = Math.min(date.length, today.length);
  return today.slice(0, n) > date.slice(0, n);
}

/**
 * Status and dates have to describe the same world.
 *
 * Errors are reserved for statements that cannot both be true: a lot that is
 * only planned cannot also have opened, and nothing opens after today. A
 * missing start or award date is a gap in what was published, not a
 * contradiction, so it warns. An elapsed `expectedOpening` on a lot still
 * building is the one that has to start speaking the moment it slips, which
 * is why `today` is a parameter rather than a call to the clock.
 */
export function checkStatusDates(
  projects: Project[],
  today: string,
): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const project of projects) {
    for (const lot of project.lots) {
      const at = `${project.id}: lot "${lot.id}"`;
      const d = lot.dates;

      if (lot.status === "planned" && d?.opened) {
        errors.push(
          `${at} has status "planned" but has dates.opened (${d.opened})`,
        );
      }
      if (d?.opened && hasElapsed(today, d.opened)) {
        errors.push(`${at} opened (${d.opened}) is in the future`);
      }
      if (lot.status === "under_construction" && !d?.constructionStart) {
        warnings.push(
          `${at} is under_construction with no dates.constructionStart`,
        );
      }
      if (lot.status === "tendered" && !d?.tenderAwarded) {
        warnings.push(`${at} is tendered with no dates.tenderAwarded`);
      }
      if (
        (lot.status === "under_construction" || lot.status === "tendered") &&
        d?.expectedOpening &&
        hasElapsed(d.expectedOpening, today)
      ) {
        warnings.push(
          `${at} expectedOpening (${d.expectedOpening}) has elapsed and the lot is still ${lot.status}`,
        );
      }
    }
  }
  return { errors, warnings };
}

/**
 * The event history, checked against the single word standing in for it.
 *
 * `status` stays authoritative for now: deriving it would change what
 * `map-filters.ts`, `country-stats.ts`, `build-data.ts` and `slip.ts` see,
 * and those are not this agent's to touch. So the disagreement is made
 * visible instead of resolved, which is what turns a silent contradiction
 * into something a person can act on.
 */
export function checkEvents(projects: Project[]): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const project of projects) {
    const ids = new Set(
      project.sources
        .map((s) => s.id)
        .filter((id): id is string => Boolean(id)),
    );
    for (const lot of project.lots) {
      const events = lot.events ?? [];
      if (events.length === 0) continue;
      const at = `${project.id}: lot "${lot.id}"`;

      for (const event of events) {
        if (event.sourceRef && !ids.has(event.sourceRef)) {
          errors.push(
            `${at} event "${event.kind}" sourceRef "${event.sourceRef}" matches no source id`,
          );
        }
      }

      // A history that stops before the lot's own latest recorded date is
      // incomplete, not contradictory: events recording only a 2013
      // termination imply "tendered" purely because nothing after it was
      // written down. Saying so is a false positive, so the incompleteness
      // is what gets reported instead.
      const recordedDates = Object.values(lot.dates ?? {}).filter(
        (d): d is string => typeof d === "string",
      );
      const latestRecorded = recordedDates.sort().at(-1);
      const latestEvent = events
        .map((e) => e.date)
        .sort()
        .at(-1)!;

      if (latestRecorded !== undefined && latestEvent < latestRecorded) {
        warnings.push(
          `${at} event history stops at ${latestEvent} but dates record ${latestRecorded}, so the history is incomplete`,
        );
      } else {
        const implied = statusFromEvents(events);
        if (implied !== null && implied !== lot.status) {
          warnings.push(
            `${at} has status "${lot.status}" but its events imply "${implied}"`,
          );
        }
      }

      // Part of a lot in service while the lot is drawn as something else is
      // how 58 km of tendered road ended up covering open motorway. The lot
      // is the unit the map draws, so the fix is to split it.
      if (
        lot.status !== "opened" &&
        events.some((e) => e.kind === "partial_opening")
      ) {
        warnings.push(
          `${at} has a partial_opening event but status "${lot.status}", so the map draws the whole lot as ${lot.status}; split the open part into its own lot`,
        );
      }

      // An event and the dates block are two records of the same fact.
      for (const [kind, field] of [
        ["construction_start", "constructionStart"],
        ["opened", "opened"],
        ["awarded", "tenderAwarded"],
      ] as const) {
        const event = events.find((e) => e.kind === kind);
        const recorded = lot.dates?.[field];
        if (!event || !recorded) continue;
        const n = Math.min(event.date.length, recorded.length);
        if (event.date.slice(0, n) !== recorded.slice(0, n)) {
          warnings.push(
            `${at} event "${kind}" (${event.date}) disagrees with dates.${field} (${recorded})`,
          );
        }
      }
    }
  }
  return { errors, warnings };
}
