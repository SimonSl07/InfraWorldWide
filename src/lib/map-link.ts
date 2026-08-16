import { formatLotRef } from "./map-filters";
import { MAP_STATUSES } from "./map-style";
import type { Lot, Project } from "./schema";

/**
 * Links from a page into the map with one section already selected.
 *
 * The map has always parsed and restored `?sel=`; nothing generated such a
 * link, so the only way to reach a section on the map was to find it by eye.
 *
 * The reference has to name the project as well as the lot. A lot id is
 * unique inside its project and nowhere else: `main-bridge` belongs to
 * ro-braila-bridge, ro-giurgiu-ruse-bridge and ro-new-europe-bridge alike.
 * `resolveLotRef` refuses an ambiguous bare id rather than opening the
 * wrong bridge, so a bare link for any of those three opened the map with
 * no panel at all. `formatLotRef` is the one place the format is written.
 */
export function mapLotHref(ref: {
  projectId: string;
  lotId: string;
}): string {
  return `/map?sel=${encodeURIComponent(formatLotRef(ref))}`;
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
