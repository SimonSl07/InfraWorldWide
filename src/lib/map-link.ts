import { MAP_STATUSES } from "./map-style";
import type { Lot, Project } from "./schema";

/**
 * Links from a page into the map with one section already selected.
 *
 * The map has always parsed and restored `?sel=`; nothing generated such a
 * link, so the only way to reach a section on the map was to find it by eye.
 *
 * Note that `sel` carries a bare lot id, and lot ids are only unique within
 * their project ("main-bridge" is used by three different bridges), so a
 * link can land on a namesake. Fixing that means changing the parameter's
 * format in map-filters.ts and MapExplorer.tsx together.
 */
export function mapLotHref(lotId: string): string {
  return `/map?sel=${encodeURIComponent(lotId)}`;
}

/**
 * Whether the main map draws this lot at all, and so whether a link into it
 * would land on anything.
 *
 * Two ways it would not: a project with a `city` key is written to that
 * city's geometry file rather than the country's, and a cancelled lot is
 * outside MAP_STATUSES so no layer renders it.
 */
export function isOnMainMap(project: Project, lot: Lot): boolean {
  return project.city === undefined && MAP_STATUSES.includes(lot.status);
}
