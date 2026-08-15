import type { BBox } from "./geo";
import type { Category } from "./schema";

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
 * instead of turning into an undefined at runtime.
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
  /** Set when this track belongs to another project; excluded from totals. */
  sharedWith?: string;
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
