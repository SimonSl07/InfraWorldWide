/**
 * Builds the runtime data artifacts consumed by the frontend:
 *
 *   public/data/projects.json          — full project index (metadata, no geometry)
 *   public/data/geo/<country>.geojson  — one FeatureCollection per country with
 *                                        lot metadata flattened onto each feature
 *                                        so MapLibre can style/filter without joins.
 *   public/data/geo/cities/<key>.geojson — the same, for projects scoped to a
 *                                        city. These are deliberately absent
 *                                        from the country files: a metro line
 *                                        at country zoom is noise on top of
 *                                        the motorway network.
 *   public/data/geo/projects/<id>.geojson — one project on its own, for the
 *                                        project page's mini-map. Without it
 *                                        that page had to download a whole
 *                                        country and filter it, which also
 *                                        silently drew nothing for the
 *                                        city-scoped projects, since those
 *                                        are not in the country file at all.
 *   public/data/geo/countries.geojson  — country outlines used as the map's
 *                                        click targets, with a precomputed bbox
 *                                        so selecting one can fit the camera.
 *   public/data/geo/cities.geojson     — one point per city, the main map's
 *                                        click target for opening a city.
 *   public/data/geo/manifest.json      — which of the above exist, plus when
 *                                        and from which commit they were built.
 *
 * Every emitted coordinate is rounded (see COORD_DECIMALS): the source
 * geometry carries up to 15 decimals, and the extra digits are pure payload.
 *
 * Runs validation first; fails the build on invalid data.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  countryGeoPath,
  dateYear,
  deflatorTableSchema,
  countsTowardNetwork,
  projectGeoPath,
  type Project,
} from "../src/lib/schema";
import {
  expectedOpeningMonth,
  expectedOpeningYear,
  monthIndex,
} from "../src/lib/contract";
import { geometryBounds, lineMidpoint, type BBox } from "../src/lib/geo";
import { roundGeometry } from "../src/lib/round-coords";
import type {
  CityMarkerProperties,
  CountryOutlineProperties,
  LotFeatureProperties,
} from "../src/lib/map-features";
import { validateAll } from "./validate-data";

/**
 * A feature as it sits in data/geo, hand-authored or fetched from Overpass.
 * The only property the build needs from it is `geometryRef`.
 */
interface SourceFeature {
  type: "Feature";
  properties?: Record<string, unknown> | null;
  geometry: unknown;
}

/**
 * A feature as this script emits it. Typing the properties against the
 * shapes the map reads back is what makes a drift a compile error: the old
 * client declaration claimed a `constructionStart` that was never written.
 */
interface GeoFeature {
  type: "Feature";
  properties:
    | LotFeatureProperties
    | CityMarkerProperties
    | CountryOutlineProperties;
  geometry: unknown;
}

const root = process.cwd();
const {
  projects,
  deflators,
  contractors,
  countries,
  fx,
  cities,
  corridors,
  programmes,
  operators,
} = validateAll(root);

/**
 * The alternative price basis. Same shape as deflators.json, so it needs no
 * code of its own, but it covers only the three currencies Eurostat
 * publishes a construction cost index for. A cost it cannot restate is
 * dropped from a ranking on that basis rather than converted on a series
 * that does not exist.
 */
const constructionDeflators = deflatorTableSchema.parse(
  JSON.parse(
    fs.readFileSync(path.join(root, "data/deflators-construction.json"), "utf8"),
  ),
);

const outDir = path.join(root, "public/data");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "geo", "cities"), { recursive: true });
fs.mkdirSync(path.join(outDir, "geo", "projects"), { recursive: true });

/**
 * Writes one artifact, minified.
 *
 * These files are downloaded and parsed by the browser on the main thread,
 * never read by a person: projects.json cost 118 KB of indentation alone.
 * Anything a human edits lives in data/, which stays formatted.
 */
function writeArtifact(relative: string, value: unknown): void {
  fs.writeFileSync(path.join(outDir, relative), JSON.stringify(value));
}

/**
 * When these artifacts were built, and from what.
 *
 * The field used to be the literal string "build", which answered nothing.
 * `commit` is null wherever git is not available (a tarball, a build image
 * without the .git directory); that is not a build failure.
 */
function buildStamp(): { generated: string; commit: string | null } {
  let commit: string | null = null;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    commit = null;
  }
  return { generated: new Date().toISOString(), commit: commit || null };
}

const stamp = buildStamp();

// Full index (metadata only — the map reads geometry from the geo files).
writeArtifact("projects.json", { ...stamp, projects });

// Reference tables.
for (const [name, table] of [
  ["deflators.json", deflators],
  ["deflators-construction.json", constructionDeflators],
  ["contractors.json", contractors],
  ["countries.json", countries],
  ["fx.json", fx],
  ["cities.json", cities],
  ["corridors.json", corridors],
  ["programmes.json", programmes],
  ["operators.json", operators],
] as const) {
  writeArtifact(name, table);
}

/**
 * Flattens one project's lots into map features.
 *
 * Every property MapLibre needs to style, filter or answer a click with has
 * to live on the feature itself — paint expressions cannot reach back into
 * projects.json.
 */
function buildProjectFeatures(project: Project): GeoFeature[] {
  const features: GeoFeature[] = [];
  const geoPath = path.join(root, projectGeoPath(project));
  const geo: { features?: SourceFeature[] } = JSON.parse(
    fs.readFileSync(geoPath, "utf8"),
  );
  const byRef = new Map(
    (geo.features ?? [])
      .filter((f) => typeof f.properties?.geometryRef === "string")
      .map((f) => [f.properties!.geometryRef as string, f]),
  );
  for (const lot of project.lots) {
    const feature = byRef.get(lot.geometryRef);
    if (!feature) continue; // already reported by validation
    // Annotated, not inferred: the map reads these back through a cast, so
    // this declaration is the only thing that can catch a drift between what
    // is written here and what the client expects.
    const props: LotFeatureProperties = {
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
      // Track this line shares with another. The geometry is drawn under
      // both lines, which is correct for a route, but anything totalling
      // length across projects has to ignore it.
      ...(lot.sharedWith ? { sharedWith: lot.sharedWith } : {}),
      // Absolute month indices (year*12 + month-1) for MapLibre filter
      // expressions — the timeline steps one calendar month at a time.
      // Named *Month so a stale year-based artifact cannot be misread as
      // months. Null when unknown; a year-only date resolves to January.
      openedMonth: monthIndex(lot.dates?.opened) ?? null,
      constructionStartMonth: monthIndex(lot.dates?.constructionStart) ?? null,
      // Explicitly sourced date, else derived from the contract duration.
      expectedOpeningMonth: expectedOpeningMonth(lot),
      // Years kept alongside for anything reading coarse dates.
      opened: lot.dates?.opened ? dateYear(lot.dates.opened) : null,
      expectedOpening: expectedOpeningYear(lot),
      /** Whether expectedOpening is derived rather than directly sourced. */
      expectedOpeningDerived: !lot.dates?.expectedOpening
        && expectedOpeningYear(lot) !== null,
    };
    // Rounded once, here, so every collection this feature lands in
    // (country, city, per-project) carries the same trimmed geometry.
    const geometry = roundGeometry(feature.geometry);
    features.push({ type: "Feature", geometry, properties: props });
    // Bridges/tunnels are too short to see (or click) at country zoom —
    // also emit a midpoint marker for the circle layer.
    if (
      (project.category === "bridge" || project.category === "tunnel") &&
      geometry &&
      (geometry as { type: string }).type === "LineString"
    ) {
      const mid = lineMidpoint(
        (geometry as { coordinates: [number, number][] }).coordinates,
      );
      if (mid) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: mid },
          properties: { ...props, marker: true },
        });
      }
    }
  }
  return features;
}

/** Every project's features, keyed by project id. Built once. */
const featuresByProject = new Map<string, GeoFeature[]>(
  projects.map((project) => [project.id, buildProjectFeatures(project)]),
);

/** The features of several projects, in the order given. */
function featuresOf(group: Project[]): GeoFeature[] {
  return group.flatMap((p) => featuresByProject.get(p.id) ?? []);
}

/** Bounding box covering every feature in a collection. */
function collectionBounds(features: GeoFeature[]): BBox | null {
  let box: BBox | null = null;
  for (const feature of features) {
    const bounds = geometryBounds(feature.geometry as GeoJSON.Geometry);
    if (!bounds) continue;
    box = box
      ? [
          Math.min(box[0], bounds[0]),
          Math.min(box[1], bounds[1]),
          Math.max(box[2], bounds[2]),
          Math.max(box[3], bounds[3]),
        ]
      : bounds;
  }
  return box;
}

let featureCount = 0;

/* ── Per-project files ────────────────────────────────────────────────── */

// The project page draws one project. It used to fetch the whole country
// and filter, which meant 196 KB for a handful of lines and, worse, drew
// nothing at all for a city-scoped project: those are not in the country
// file by design.
const projectIds: string[] = [];
for (const project of projects) {
  const features = featuresByProject.get(project.id) ?? [];
  projectIds.push(project.id);
  writeArtifact(`geo/projects/${project.id}.geojson`, {
    type: "FeatureCollection",
    features,
  });
}
projectIds.sort();

/* ── Country files: everything not scoped to a city ───────────────────── */

const mapProjects = projects.filter((p) => !p.city);
const byCountry = new Map<string, Project[]>();
for (const p of mapProjects) {
  const list = byCountry.get(p.country) ?? [];
  list.push(p);
  byCountry.set(p.country, list);
}

for (const [country, countryProjects] of byCountry) {
  const features = featuresOf(countryProjects);
  featureCount += features.length;
  writeArtifact(`geo/${country}.geojson`, {
    type: "FeatureCollection",
    features,
  });
}

/* ── City files, plus the point markers that open them ────────────────── */

const cityKeys = Object.keys(cities.cities).sort();
const cityMarkers: GeoFeature[] = [];

for (const key of cityKeys) {
  const city = cities.cities[key];
  const cityProjects = projects.filter((p) => p.city === key);
  const features = featuresOf(cityProjects);
  featureCount += features.length;
  writeArtifact(`geo/cities/${key}.geojson`, {
    type: "FeatureCollection",
    features,
  });

  // The marker sits at the city centre, but the bbox comes from the actual
  // project geometry so the city view frames the network rather than an
  // arbitrary radius around a point.
  const bbox = collectionBounds(features);
  const markerProps: CityMarkerProperties = {
    city: key,
    country: city.country,
    name: city.name.en,
    projects: cityProjects.length,
    lots: cityProjects.reduce((sum, p) => sum + p.lots.length, 0),
    // A network total spans projects, so a tunnel two lines run through is
    // counted once. Without the filter the marker and the city panel said
    // Sofia was 68.76 km while the city page said 54.56 km.
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
  cityMarkers.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: city.center },
    properties: markerProps,
  });
}

writeArtifact("geo/cities.geojson", {
  type: "FeatureCollection",
  features: cityMarkers,
});

/* ── Country outlines ─────────────────────────────────────────────────── */

// Merged into one file: they are small, always all needed at once, and a
// single request beats one per country. Driven by every country that has
// projects, city-scoped ones included — a country whose only entry is a
// metro line still needs an outline to be clickable.
const outlineFeatures: GeoFeature[] = [];
const allCountries = [...new Set(projects.map((p) => p.country))].sort();
for (const country of allCountries) {
  const outline: { features?: SourceFeature[] } = JSON.parse(
    fs.readFileSync(path.join(root, countryGeoPath(country)), "utf8"),
  );
  for (const feature of outline.features ?? []) {
    const bbox = geometryBounds(feature.geometry as GeoJSON.Geometry);
    if (!bbox) continue; // already reported by validation
    outlineFeatures.push({
      type: "Feature",
      geometry: roundGeometry(feature.geometry),
      // bbox is baked in so selecting a country can fit the camera without
      // walking thousands of coordinates in the browser. Taken from the
      // full-precision geometry: rounding can only move it by 0.1 m, but
      // there is no reason to let it move inward at all.
      properties: { country, bbox },
    });
  }
}
writeArtifact("geo/countries.geojson", {
  type: "FeatureCollection",
  features: outlineFeatures,
});

// Manifest so the map knows which files to fetch, and when they were built.
writeArtifact("geo/manifest.json", {
  ...stamp,
  countries: [...byCountry.keys()].sort(),
  cities: cityKeys,
  projects: projectIds,
});

console.log(
  `✓ built public/data: ${projects.length} project(s), ${featureCount} feature(s), ${byCountry.size} country file(s), ${cityKeys.length} city file(s), ${projectIds.length} project file(s), ${outlineFeatures.length} outline(s)`,
);
