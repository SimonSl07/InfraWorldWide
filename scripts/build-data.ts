/**
 * Builds the runtime data artifacts consumed by the frontend:
 *
 *   public/data/projects.json        — full project index (metadata, no geometry)
 *   public/data/geo/<country>.geojson — one FeatureCollection per country with
 *                                       lot metadata flattened onto each feature
 *                                       so MapLibre can style/filter without joins.
 *
 * Runs validation first; fails the build on invalid data.
 */
import fs from "node:fs";
import path from "node:path";
import { dateYear, projectGeoPath, type Project } from "../src/lib/schema";
import {
  expectedOpeningMonth,
  expectedOpeningYear,
  monthIndex,
} from "../src/lib/contract";
import { lineMidpoint } from "../src/lib/geo";
import { validateAll } from "./validate-data";

interface GeoFeature {
  type: "Feature";
  properties?: Record<string, unknown> | null;
  geometry: unknown;
}

const root = process.cwd();
const { projects, deflators, contractors } = validateAll(root);

const outDir = path.join(root, "public/data");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "geo"), { recursive: true });

// Full index (metadata only — the map reads geometry from the geo files).
fs.writeFileSync(
  path.join(outDir, "projects.json"),
  JSON.stringify({ generated: "build", projects }, null, 2),
);

// Reference tables for the delivery-performance rankings.
fs.writeFileSync(
  path.join(outDir, "deflators.json"),
  JSON.stringify(deflators, null, 2),
);
fs.writeFileSync(
  path.join(outDir, "contractors.json"),
  JSON.stringify(contractors, null, 2),
);

// Per-country geometry with flattened lot properties.
const byCountry = new Map<string, Project[]>();
for (const p of projects) {
  const list = byCountry.get(p.country) ?? [];
  list.push(p);
  byCountry.set(p.country, list);
}

let featureCount = 0;
for (const [country, countryProjects] of byCountry) {
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
        category: project.category,
        status: lot.status,
        lengthKm: lot.lengthKm,
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
      featureCount++;
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
          featureCount++;
        }
      }
    }
  }
  fs.writeFileSync(
    path.join(outDir, "geo", `${country}.geojson`),
    JSON.stringify({ type: "FeatureCollection", features }),
  );
}

// Manifest so the map knows which country files to fetch.
fs.writeFileSync(
  path.join(outDir, "geo", "manifest.json"),
  JSON.stringify({ countries: [...byCountry.keys()].sort() }),
);

console.log(
  `✓ built public/data: ${projects.length} project(s), ${featureCount} feature(s), ${byCountry.size} country file(s)`,
);
