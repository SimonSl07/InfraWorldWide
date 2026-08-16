import fs from "node:fs";
import path from "node:path";

/**
 * The site's undocumented public API, written down.
 *
 * Everything the data build emits lands in `public/data`, which Next serves
 * as static files, so the whole dataset has been fetchable all along with
 * nothing saying so, what any of it contains, or that the route geometry
 * carries an ODbL obligation on whoever reuses it. This module is the
 * machine-readable half of that page.
 */

export type EndpointFormat = "json" | "geojson";

export interface DataEndpoint {
  /** Path under the site root; `{...}` marks a per-record file. */
  path: string;
  /**
   * A concrete path for a record that exists, so the page can link one.
   * Null when the dataset holds nothing of that kind.
   */
  example: string | null;
  format: EndpointFormat;
  /** Key under `dataPage.endpoints.*` for the description. */
  key: string;
  /** Published JSON Schema, as a file name under `schema/`. */
  schema?: string;
  /** Geometry derived from OpenStreetMap: ODbL, attribution required. */
  odbl?: boolean;
}

/** One existing id of each templated kind, for the example paths. */
export interface EndpointSamples {
  country?: string;
  city?: string;
  project?: string;
}

interface Template extends Omit<DataEndpoint, "example"> {
  /** Which sample fills the placeholder in `path`, when it is templated. */
  sample?: keyof EndpointSamples;
}

const TEMPLATES: Template[] = [
  {
    path: "/data/projects.json",
    format: "json",
    key: "projects",
    schema: "project.schema.json",
  },
  {
    path: "/data/countries.json",
    format: "json",
    key: "countries",
    schema: "countries.schema.json",
  },
  {
    path: "/data/cities.json",
    format: "json",
    key: "cities",
    schema: "cities.schema.json",
  },
  { path: "/data/contractors.json", format: "json", key: "contractors" },
  {
    path: "/data/deflators.json",
    format: "json",
    key: "deflators",
    schema: "deflators.schema.json",
  },
  {
    path: "/data/deflators-construction.json",
    format: "json",
    key: "deflatorsConstruction",
    schema: "deflators.schema.json",
  },
  {
    path: "/data/fx.json",
    format: "json",
    key: "fx",
    schema: "fx.schema.json",
  },
  { path: "/data/geo/manifest.json", format: "json", key: "manifest" },
  {
    path: "/data/geo/countries.geojson",
    format: "geojson",
    key: "countryOutlines",
  },
  { path: "/data/geo/cities.geojson", format: "geojson", key: "cityMarkers" },
  {
    path: "/data/geo/{country}.geojson",
    format: "geojson",
    key: "countryGeometry",
    odbl: true,
    sample: "country",
  },
  {
    path: "/data/geo/cities/{city}.geojson",
    format: "geojson",
    key: "cityGeometry",
    odbl: true,
    sample: "city",
  },
  {
    path: "/data/geo/projects/{project}.geojson",
    format: "geojson",
    key: "projectGeometry",
    odbl: true,
    sample: "project",
  },
];

export function dataEndpoints(samples: EndpointSamples): DataEndpoint[] {
  return TEMPLATES.map(({ sample, ...endpoint }) => {
    if (!sample) return { ...endpoint, example: endpoint.path };
    const value = samples[sample];
    return {
      ...endpoint,
      example: value
        ? endpoint.path.replace(`{${sample}}`, value)
        : null,
    };
  });
}

/** The endpoints whose reuse carries the ODbL share-alike obligation. */
export function odblEndpoints(endpoints: DataEndpoint[]): DataEndpoint[] {
  return endpoints.filter((e) => e.odbl === true);
}

/** When the artifacts were compiled, and from which commit. */
export interface BuildStamp {
  /** ISO 8601 timestamp written by the data build. */
  generated: string;
  /**
   * Null where the build could not ask git: a source tarball, or a container
   * image without the .git directory. `buildStamp()` in build-data.ts writes
   * null there deliberately and says it is not a build failure, so rejecting
   * the stamp over it threw away a manifest that was otherwise complete, and
   * with it every example link on /data.
   */
  commit: string | null;
}

/**
 * The stamp off an artifact, or null when it carries none.
 *
 * The timestamp is what makes a stamp a stamp, so a missing or empty one is
 * still nothing. Null rather than a partial record: a page printing
 * "generated undefined" is worse than one that leaves the line out.
 */
export function parseBuildStamp(value: unknown): BuildStamp | null {
  if (typeof value !== "object" || value === null) return null;
  const { generated, commit } = value as Record<string, unknown>;
  if (typeof generated !== "string" || generated.length === 0) return null;
  return {
    generated,
    commit: typeof commit === "string" && commit.length > 0 ? commit : null,
  };
}

/** The geo manifest as written by the data build. */
export interface GeoManifest extends BuildStamp {
  countries: string[];
  cities: string[];
  projects: string[];
}

/**
 * Reads the manifest off disk at build time. Kept beside the pure helpers
 * above rather than in data.ts, which has no reader for the stamp and which
 * this module must not reach into.
 */
export function readGeoManifest(): GeoManifest | null {
  const file = path.join(process.cwd(), "public/data/geo/manifest.json");
  if (!fs.existsSync(file)) return null;
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  const stamp = parseBuildStamp(parsed);
  if (!stamp) return null;
  const { countries, cities, projects } = parsed as Record<string, unknown>;
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return {
    ...stamp,
    countries: list(countries),
    cities: list(cities),
    projects: list(projects),
  };
}
