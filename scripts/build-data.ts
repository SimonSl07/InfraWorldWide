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
 * Runs validation first; fails the build on invalid data. The work is in
 * `main()`, run only when this file is the entry point, so the module can
 * be imported without it writing anything.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  countryGeoPath,
  deflatorTableSchema,
  projectGeoPath,
  type Project,
} from "../src/lib/schema";
import { geometryBounds, lineMidpoint, type BBox } from "../src/lib/geo";
import { roundGeometry } from "../src/lib/round-coords";
import { EXTERNAL_LINKS } from "../src/lib/links";
// Annotated against the reader's own type: the producer emitting a null
// commit while the parser demanded a string is the bug this pairs up.
import type { BuildStamp } from "../src/lib/data-endpoints";
import {
  cityMarkerProperties,
  lotFeatureProperties,
  type CityMarkerProperties,
  type CountryOutlineProperties,
  type LotFeatureProperties,
} from "../src/lib/map-features";
import { validateAll } from "../src/lib/validation";

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
    LotFeatureProperties | CityMarkerProperties | CountryOutlineProperties;
  geometry: unknown;
}

function main(): void {
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
      fs.readFileSync(
        path.join(root, "data/deflators-construction.json"),
        "utf8",
      ),
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

  // ODbL 4.2: a database conveyed publicly carries its licence or a link to
  // it. These files are served at /data, so the notice has to travel with
  // them and not only sit in the repository nobody fetching JSON will open.
  fs.writeFileSync(
    path.join(outDir, "LICENSE.txt"),
    [
      "InfraWorldWide data: terms by path",
      "",
      "geo/ro.geojson, geo/bg.geojson, geo/rs.geojson,",
      "geo/cities/*.geojson, geo/projects/*.geojson",
      "  Route geometry derived from OpenStreetMap. Open Database License",
      "  (ODbL) 1.0: https://opendatacommons.org/licenses/odbl/1-0/",
      "  Credit any work you make from it with:",
      "    © OpenStreetMap contributors, ODbL",
      "  Publishing altered geometry means publishing it under ODbL too.",
      "",
      "geo/countries.geojson",
      "  Natural Earth 1:50m admin-0. Public domain, no conditions.",
      "",
      "Everything else, including geo/cities.geojson and geo/manifest.json",
      "  Curated records and reference tables, CC BY 4.0:",
      "  https://creativecommons.org/licenses/by/4.0/",
      "  Credit: Data from InfraWorldWide (https://infraworldwide.com),",
      "  CC BY 4.0. Say if you changed it.",
      "",
      "Individual figures come from public sources named in each record.",
      "Full terms and the credit each source asks for:",
      `${EXTERNAL_LINKS.repo}/blob/main/data/LICENSE`,
      `${EXTERNAL_LINKS.repo}/blob/main/data/ATTRIBUTION.md`,
      "",
    ].join("\n"),
  );

  /**
   * When these artifacts were built, and from what.
   *
   * The field used to be the literal string "build", which answered nothing.
   * `commit` is null wherever git is not available (a tarball, a build image
   * without the .git directory); that is not a build failure.
   */
  function buildStamp(): BuildStamp {
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
      // Built in src/lib/map-features.ts, beside the type the client reads
      // these back through, so what is written and what is expected are one
      // declaration and a test can hold them to it.
      const props = lotFeatureProperties(project, lot);
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
    cityMarkers.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: city.center },
      properties: cityMarkerProperties(key, city, cityProjects, bbox),
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
}

if (process.argv[1] && process.argv[1].endsWith("build-data.ts")) {
  main();
}
