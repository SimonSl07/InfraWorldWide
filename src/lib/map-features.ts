import { dateYear, type Category, type Lot, type Project } from "./schema";
import { expectedOpeningMonth, expectedOpeningYear, monthIndex } from "./contract";
import type { BBox } from "./geo";

/**
 * The contract between the data build and the map.
 *
 * `scripts/build-data.ts` flattens lot metadata onto every GeoJSON feature
 * because MapLibre paint expressions cannot reach back into projects.json.
 * The client then reads those properties back through an `as unknown as`
 * cast, which is a compiler blind spot: the old declaration claimed a
 * `constructionStart` the build never emitted, and omitted the `bbox` it
 * did, so a city marker could never frame its own network.
 *
 * Both sides are annotated against these types so a drift fails tsc
 * instead of turning into an undefined at runtime. The flattening itself
 * lives here rather than in the script for the same reason: build-data.ts
 * does its work at module scope, so nothing can import it to check what it
 * emits, and `partOf` went missing from every feature without a single test
 * being able to notice.
 */

/** Properties the build writes onto every lot feature. */
export interface LotFeatureProperties {
  lotId: string;
  projectId: string;
  /** English name; the map draws one label set regardless of UI locale. */
  projectName: string;
  lotName: string;
  /** ISO 3166-1 alpha-2, lowercase. Drives the country dimming expression. */
  country: string;
  /** Present only on city-scoped projects, which the main map excludes. */
  city?: string;
  category: Category;
  status: string;
  lengthKm: number;
  /**
   * The two markers saying another project already counts these kilometres:
   * `sharedWith` is track another line owns, `partOf` is works inside a
   * section its parent already measures. Both have to travel onto the
   * feature, because a total computed client-side from the GeoJSON has no
   * way back to projects.json and would otherwise apply only the one it can
   * see. See `countsTowardNetwork` in schema.ts and AGENTS.md.
   */
  sharedWith?: string;
  partOf?: string;
  /** Absolute month indices (year*12 + month-1). Null when unknown. */
  openedMonth: number | null;
  constructionStartMonth: number | null;
  /** Sourced date if there is one, else derived from the contract duration. */
  expectedOpeningMonth: number | null;
  /** Years, kept alongside the month indices for coarse reads. */
  opened: number | null;
  expectedOpening: number | null;
  /** True when expectedOpening is projected rather than published. */
  expectedOpeningDerived: boolean;
  /**
   * Only on the duplicate midpoint feature the build emits for bridges and
   * tunnels, which are too short to see or click at country zoom.
   */
  marker?: true;
}

/**
 * One lot's properties, as the build writes them onto its feature.
 *
 * Pure, so `map-features.test.ts` can state what the map is entitled to read
 * back. Everything MapLibre needs to style, filter or answer a click with
 * has to be in here: an expression cannot reach into projects.json, and a
 * client-side total cannot apply a rule whose input was never emitted.
 */
export function lotFeatureProperties(
  project: Project,
  lot: Lot,
): LotFeatureProperties {
  return {
    lotId: lot.id,
    projectId: project.id,
    projectName: project.name.en,
    lotName: lot.name.en,
    // Drives the "dim everything outside the selected country" paint
    // expression, which cannot reach back into projects.json.
    country: project.country,
    ...(project.city ? { city: project.city } : {}),
    category: project.category,
    status: lot.status,
    lengthKm: lot.lengthKm,
    // The two ways another project already counts these kilometres. The
    // geometry is drawn either way, which is correct for a route, but
    // anything totalling length across projects has to ignore both, so both
    // have to be here. Emitting only `sharedWith` is what let the map's
    // change readout add the A1, A3 and A8 tunnels on top of the sections
    // that contain them. See `countsTowardNetwork` in schema.ts.
    ...(lot.sharedWith ? { sharedWith: lot.sharedWith } : {}),
    ...(lot.partOf ? { partOf: lot.partOf } : {}),
    // Absolute month indices (year*12 + month-1) for MapLibre filter
    // expressions: the timeline steps one calendar month at a time. Named
    // *Month so a stale year-based artifact cannot be misread as months.
    // Null when unknown; a year-only date resolves to January.
    openedMonth: monthIndex(lot.dates?.opened) ?? null,
    constructionStartMonth: monthIndex(lot.dates?.constructionStart) ?? null,
    // Explicitly sourced date, else derived from the contract duration.
    expectedOpeningMonth: expectedOpeningMonth(lot),
    // Years kept alongside for anything reading coarse dates.
    opened: lot.dates?.opened ? dateYear(lot.dates.opened) : null,
    expectedOpening: expectedOpeningYear(lot),
    expectedOpeningDerived:
      !lot.dates?.expectedOpening && expectedOpeningYear(lot) !== null,
  };
}

/** Properties the build writes onto every country outline polygon. */
export interface CountryOutlineProperties {
  /** ISO 3166-1 alpha-2, lowercase. */
  country: string;
  /**
   * Baked in so selecting a country can fit the camera without walking
   * thousands of coordinates in the browser.
   */
  bbox: BBox;
}

/** Properties the build writes onto every city marker point. */
export interface CityMarkerProperties {
  city: string;
  country: string;
  name: string;
  projects: number;
  lots: number;
  km: number;
  /**
   * Box around the city's actual project geometry, not a radius around the
   * centre point, so opening a city frames its network.
   */
  bbox?: BBox;
}
