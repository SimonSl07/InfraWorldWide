/**
 * Fetches country outlines used as the map's click targets.
 *
 * Source is Natural Earth 1:50m admin-0 (public domain, no attribution
 * required) rather than OSM: a country relation carries megabytes of
 * coastline detail, and an outline that only ever serves as a click target
 * and a dimming mask does not need it. The trade-off is that these borders
 * do not align pixel-perfectly with the OSM basemap at high zoom, which is
 * why the rendered outline fades out past z8.
 *
 * Writes one file per country to data/geo/countries/<cc>.geojson. Output is
 * committed — this script exists to make that output reproducible, not to
 * run on every build.
 *
 * Usage:
 *   tsx scripts/fetch-country-outlines.ts            # countries with projects
 *   tsx scripts/fetch-country-outlines.ts ro bg rs   # explicit list
 *   tsx scripts/fetch-country-outlines.ts --diff     # compare, write nothing
 *   tsx scripts/fetch-country-outlines.ts --check    # exit 1 if anything moved
 *
 * --diff and --check exist so a scheduled job can notice Natural Earth
 * redrawing a border and raise a pull request, instead of a rerun silently
 * replacing reviewed geometry.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { diffRecords, formatDiff, hasChanges } from "../src/lib/record-diff";
import { collectErrors } from "../src/lib/validation";

const SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";

/**
 * Natural Earth is ~50 m accurate, so coordinates beyond 4 decimals (~11 m)
 * are noise. Rounding there roughly halves the file with no visible change.
 */
const COORD_DECIMALS = 4;

interface NeFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

type Ring = [number, number][];

function round(value: number): number {
  const factor = 10 ** COORD_DECIMALS;
  return Math.round(value * factor) / factor;
}

/** Rounds a ring and drops points the rounding made duplicates of. */
function simplifyRing(ring: Ring): Ring {
  const out: Ring = [];
  for (const [lng, lat] of ring) {
    const point: [number, number] = [round(lng), round(lat)];
    const last = out[out.length - 1];
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    out.push(point);
  }
  // A ring must stay closed, and needs 4 points to still be a ring.
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    out.push([first[0], first[1]]);
  }
  return out.length >= 4 ? out : [];
}

function simplifyPolygon(rings: Ring[]): Ring[] {
  return rings.map(simplifyRing).filter((r) => r.length > 0);
}

function simplifyGeometry(geometry: NeFeature["geometry"]) {
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon" as const,
      coordinates: simplifyPolygon(geometry.coordinates as Ring[]),
    };
  }
  return {
    type: "MultiPolygon" as const,
    coordinates: (geometry.coordinates as Ring[][])
      .map(simplifyPolygon)
      .filter((p) => p.length > 0),
  };
}

/**
 * ISO_A2 is "-99" for territories whose status Natural Earth treats as
 * disputed (Kosovo, and historically France/Norway); ISO_A2_EH carries the
 * de-facto code for those, so it is tried first.
 */
function isoCode(feature: NeFeature): string | null {
  for (const key of ["ISO_A2_EH", "ISO_A2", "WB_A2"]) {
    const value = feature.properties[key];
    if (typeof value === "string" && /^[A-Za-z]{2}$/.test(value)) {
      return value.toLowerCase();
    }
  }
  return null;
}

async function loadSource(): Promise<{ features: NeFeature[] }> {
  // Cached in the temp dir: the file is 3 MB and iterating on this script
  // should not re-download it each run.
  const cache = path.join(os.tmpdir(), "ne_50m_admin_0_countries.geojson");
  if (fs.existsSync(cache)) {
    console.log(`· using cached ${cache}`);
    return JSON.parse(fs.readFileSync(cache, "utf8"));
  }
  console.log(`· downloading ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`download failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  fs.writeFileSync(cache, text);
  return JSON.parse(text);
}

/** Outline as one flat, comparable record. */
type OutlineRecord = Record<string, unknown> & {
  name: string;
  source: string;
  geometry: string;
  parts: number;
  positions: number;
  bbox: string;
  digest: string;
};

/**
 * Reduces an outline to something a diff can print. Coordinates themselves are
 * useless in a log, so the shape is summarised and the full geometry is
 * fingerprinted: a single moved vertex changes the digest and nothing else.
 */
function outlineRecord(collection: {
  features?: Array<{
    properties?: Record<string, unknown> | null;
    geometry?: { type?: string; coordinates?: unknown } | null;
  }>;
}): OutlineRecord | null {
  const feature = collection.features?.[0];
  if (!feature?.geometry) return null;
  const rings: Ring[] =
    feature.geometry.type === "Polygon"
      ? (feature.geometry.coordinates as Ring[])
      : (feature.geometry.coordinates as Ring[][]).flat();

  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  let positions = 0;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      positions++;
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }

  return {
    name: String(feature.properties?.name ?? ""),
    source: String(feature.properties?.source ?? ""),
    geometry: String(feature.geometry.type ?? ""),
    parts: rings.length,
    positions,
    bbox: [west, south, east, north].map((n) => n.toFixed(3)).join(","),
    digest: crypto
      .createHash("sha1")
      .update(JSON.stringify(feature.geometry))
      .digest("hex")
      .slice(0, 12),
  };
}

function readOutline(file: string): OutlineRecord | null {
  if (!fs.existsSync(file)) return null;
  try {
    return outlineRecord(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

async function main() {
  const root = process.cwd();
  const diffOnly = process.argv.includes("--diff");
  const check = process.argv.includes("--check");
  const explicit = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const wanted =
    explicit.length > 0
      ? explicit.map((c) => c.toLowerCase())
      : [
          ...new Set(collectErrors(root).projects.map((p) => p.country)),
        ].sort();

  if (wanted.length === 0) {
    console.error("no countries requested and no projects found");
    process.exit(1);
  }

  const source = await loadSource();
  const byCode = new Map<string, NeFeature>();
  for (const feature of source.features) {
    const code = isoCode(feature);
    if (code && !byCode.has(code)) byCode.set(code, feature);
  }

  const outDir = path.join(root, "data/geo/countries");
  if (!diffOnly && !check) fs.mkdirSync(outDir, { recursive: true });

  const missing: string[] = [];
  const committed: Record<string, OutlineRecord> = {};
  const fetched: Record<string, OutlineRecord> = {};

  for (const code of wanted) {
    const feature = byCode.get(code);
    if (!feature) {
      missing.push(code);
      continue;
    }
    const out = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {
            country: code,
            name: feature.properties.NAME_EN ?? feature.properties.NAME,
            source: "Natural Earth 1:50m admin-0 (public domain)",
          },
          geometry: simplifyGeometry(feature.geometry),
        },
      ],
    };
    const file = path.join(outDir, `${code}.geojson`);

    if (diffOnly || check) {
      const before = readOutline(file);
      if (before) committed[code] = before;
      const after = outlineRecord(out);
      if (after) fetched[code] = after;
      continue;
    }

    fs.writeFileSync(file, JSON.stringify(out));
    const kb = Math.round(fs.statSync(file).size / 1024);
    console.log(`✓ ${path.relative(root, file)} (${kb} KB)`);
  }

  if (diffOnly || check) {
    const diff = diffRecords(committed, fetched);
    console.log(
      formatDiff(diff, {
        label: "country outline",
        summaryFields: ["name", "positions", "digest"],
      }),
    );
    if (missing.length > 0) {
      console.log(`! no Natural Earth feature for: ${missing.join(", ")}`);
    }
    if (check && (hasChanges(diff) || missing.length > 0)) {
      console.log(
        "Natural Earth differs from data/geo/countries. Rerun without --check to rewrite, and review the geometry before committing.",
      );
      process.exit(1);
    }
    return;
  }

  if (missing.length > 0) {
    console.error(`✗ no Natural Earth feature for: ${missing.join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
