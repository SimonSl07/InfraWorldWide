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
 *   public/data/geo/countries.geojson  — country outlines used as the map's
 *                                        click targets, with a precomputed bbox
 *                                        so selecting one can fit the camera.
 *   public/data/geo/cities.geojson     — one point per city, the main map's
 *                                        click target for opening a city.
 *
 * Runs validation first; fails the build on invalid data.
 */
import fs from "node:fs";
import path from "node:path";
import {
  countryGeoPath,
  dateYear,
  projectGeoPath,
  type Project,
} from "../src/lib/schema";
import {
  expectedOpeningMonth,
  expectedOpeningYear,
  monthIndex,
} from "../src/lib/contract";
import { geometryBounds, lineMidpoint, type BBox } from "../src/lib/geo";
import { validateAll } from "./validate-data";

interface GeoFeature {
  type: "Feature";
  properties?: Record<string, unknown> | null;
  geometry: unknown;
}

const root = process.cwd();
const { projects, deflators, contractors, countries, fx, cities } =
  validateAll(root);

const outDir = path.join(root, "public/data");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "geo", "cities"), { recursive: true });

// Full index (metadata only — the map reads geometry from the geo files).
fs.writeFileSync(
  path.join(outDir, "projects.json"),
  JSON.stringify({ generated: "build", projects }, null, 2),
);

// Reference tables.
for (const [name, table] of [
  ["deflators.json", deflators],
  ["contractors.json", contractors],
  ["countries.json", countries],
  ["fx.json", fx],
  ["cities.json", cities],
] as const) {
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(table, null, 2));
}

/**
 * Flattens a project's lots into map features.
 *
 * Every property MapLibre needs to style, filter or answer a click with has
 * to live on the feature itself — paint expressions cannot reach back into
 * projects.json.
 */
function buildFeatures(countryProjects: Project[]): GeoFeature[] {
  const features: GeoFeature[] = [];
  for (const project of countryProjects) {
    const geoPath = path.join(root, projectGeoPath(project));
    const geo: { features?: GeoFeature[] } = JSON.parse(
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
      const props = {
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
      features.push({
        type: "Feature",
        geometry: feature.geometry,
        properties: props,
      });
      // Bridges/tunnels are too short to see (or click) at country zoom —
      // also emit a midpoint marker for the circle layer.
      if (
        (project.category === "bridge" || project.category === "tunnel") &&
        feature.geometry &&
        (feature.geometry as { type: string }).type === "LineString"
      ) {
        const mid = lineMidpoint(
          (feature.geometry as { coordinates: [number, number][] }).coordinates,
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
  }
  return features;
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

/* ── Country files: everything not scoped to a city ───────────────────── */

const mapProjects = projects.filter((p) => !p.city);
const byCountry = new Map<string, Project[]>();
for (const p of mapProjects) {
  const list = byCountry.get(p.country) ?? [];
  list.push(p);
  byCountry.set(p.country, list);
}

for (const [country, countryProjects] of byCountry) {
  const features = buildFeatures(countryProjects);
  featureCount += features.length;
  fs.writeFileSync(
    path.join(outDir, "geo", `${country}.geojson`),
    JSON.stringify({ type: "FeatureCollection", features }),
  );
}

/* ── City files, plus the point markers that open them ────────────────── */

const cityKeys = Object.keys(cities.cities).sort();
const cityMarkers: GeoFeature[] = [];

for (const key of cityKeys) {
  const city = cities.cities[key];
  const cityProjects = projects.filter((p) => p.city === key);
  const features = buildFeatures(cityProjects);
  featureCount += features.length;
  fs.writeFileSync(
    path.join(outDir, "geo", "cities", `${key}.geojson`),
    JSON.stringify({ type: "FeatureCollection", features }),
  );

  // The marker sits at the city centre, but the bbox comes from the actual
  // project geometry so the city view frames the network rather than an
  // arbitrary radius around a point.
  const bbox = collectionBounds(features);
  cityMarkers.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: city.center },
    properties: {
      city: key,
      country: city.country,
      name: city.name.en,
      projects: cityProjects.length,
      lots: cityProjects.reduce((sum, p) => sum + p.lots.length, 0),
      km: cityProjects.reduce(
        (sum, p) => sum + p.lots.reduce((s, l) => s + l.lengthKm, 0),
        0,
      ),
      ...(bbox ? { bbox } : {}),
    },
  });
}

fs.writeFileSync(
  path.join(outDir, "geo", "cities.geojson"),
  JSON.stringify({ type: "FeatureCollection", features: cityMarkers }),
);

/* ── Country outlines ─────────────────────────────────────────────────── */

// Merged into one file: they are small, always all needed at once, and a
// single request beats one per country. Driven by every country that has
// projects, city-scoped ones included — a country whose only entry is a
// metro line still needs an outline to be clickable.
const outlineFeatures: GeoFeature[] = [];
const allCountries = [...new Set(projects.map((p) => p.country))].sort();
for (const country of allCountries) {
  const outline: { features?: GeoFeature[] } = JSON.parse(
    fs.readFileSync(path.join(root, countryGeoPath(country)), "utf8"),
  );
  for (const feature of outline.features ?? []) {
    const bbox = geometryBounds(feature.geometry as GeoJSON.Geometry);
    if (!bbox) continue; // already reported by validation
    outlineFeatures.push({
      type: "Feature",
      geometry: feature.geometry,
      // bbox is baked in so selecting a country can fit the camera without
      // walking thousands of coordinates in the browser.
      properties: { country, bbox },
    });
  }
}
fs.writeFileSync(
  path.join(outDir, "geo", "countries.geojson"),
  JSON.stringify({ type: "FeatureCollection", features: outlineFeatures }),
);

// Manifest so the map knows which files to fetch.
fs.writeFileSync(
  path.join(outDir, "geo", "manifest.json"),
  JSON.stringify({ countries: [...byCountry.keys()].sort(), cities: cityKeys }),
);

console.log(
  `✓ built public/data: ${projects.length} project(s), ${featureCount} feature(s), ${byCountry.size} country file(s), ${cityKeys.length} city file(s), ${outlineFeatures.length} outline(s)`,
);
