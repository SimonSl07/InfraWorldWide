import {
  countsTowardNetwork,
  dateYear,
  type Category,
  type City,
  type Lot,
  type NetworkExclusion,
  type Project,
} from "./schema";
import { expectedOpeningYear } from "./contract";
import { lotMonths } from "./country-stats";
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
 * lives here rather than in the script so a test can hold it to the type
 * it is read back through: `partOf` went missing from every feature while
 * the flattening was an expression inside build-data.ts that nothing
 * imported.
 */

/**
 * Properties the build writes onto every lot feature.
 *
 * Extends `NetworkExclusion` rather than restating `sharedWith`/`partOf`:
 * both markers have to travel onto the feature, because a total computed
 * client-side from the GeoJSON has no way back to projects.json and would
 * otherwise apply only the one it can see. Deriving the pair means a third
 * marker arrives here by itself. See `countsTowardNetwork` and AGENTS.md.
 */
export interface LotFeatureProperties extends NetworkExclusion {
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
   * Absolute month indices (year*12 + month-1), null when unknown. The same
   * three `lotMonths` produces, so the map and the state rules read one
   * definition of what dates a lot has.
   */
  openedMonth: number | null;
  constructionStartMonth: number | null;
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
    // The geometry is drawn either way, which is correct for a route, but
    // anything totalling length across projects has to ignore both markers,
    // so both have to be here. Emitting only `sharedWith` is what let the
    // map's change readout add the A1, A3 and A8 tunnels on top of the
    // sections that contain them.
    ...(lot.sharedWith ? { sharedWith: lot.sharedWith } : {}),
    ...(lot.partOf ? { partOf: lot.partOf } : {}),
    // The same three the state rules use: one definition of what dates a lot
    // has, rather than a copy that can drift. The timeline steps one calendar
    // month at a time, and a year-only date resolves to January.
    ...lotMonths(lot),
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
  /**
   * Network length, so a total across the city's projects: it applies
   * `countsTowardNetwork`. Without that the marker said Sofia was 68.76 km
   * while the city page said 54.56, the two metro lines through-running one
   * tunnel being counted twice.
   */
  km: number;
  /**
   * Box around the city's actual project geometry, not a radius around the
   * centre point, so opening a city frames its network.
   */
  bbox?: BBox;
}

/**
 * One city marker's properties.
 *
 * Here rather than inline in the build for the same reason as
 * `lotFeatureProperties`: `km` is a total that spans projects, AGENTS.md
 * requires every such total to answer to `countsTowardNetwork` in
 * `network-totals.test.ts`, and a pure function beside the type is what
 * can answer there.
 */
export function cityMarkerProperties(
  key: string,
  city: City,
  cityProjects: Project[],
  bbox: BBox | null,
): CityMarkerProperties {
  return {
    city: key,
    country: city.country,
    name: city.name.en,
    projects: cityProjects.length,
    lots: cityProjects.reduce((sum, p) => sum + p.lots.length, 0),
    km: cityProjects.reduce(
      (sum, p) =>
        sum +
        p.lots
          .filter(countsTowardNetwork)
          .reduce((s, l) => s + l.lengthKm, 0),
      0,
    ),
    ...(bbox ? { bbox } : {}),
  };
}
