/**
 * Fetches motorway/railway geometry for one route from OpenStreetMap via the
 * Overpass API and slices it into named sections:
 *
 *   npx tsx scripts/fetch-osm-geometry.ts \
 *     --country ro --ref A2 --highway motorway \
 *     --out data/geo/ro/a2.geojson \
 *     --section bucharest-fetesti:26.10,44.43:27.36,44.38 \
 *     --section fetesti-cernavoda:27.36,44.38:28.05,44.34 \
 *     --section cernavoda-constanta:28.05,44.34:28.65,44.18
 *
 * Each --section is "geometryRef:fromLng,fromLat:toLng,toLat" — the script
 * finds the nearest vertices of the stitched route to the two endpoints and
 * emits the sub-polyline between them.
 *
 * OSM data is ODbL-licensed: the app must keep "© OpenStreetMap contributors"
 * attribution, and derived geometry databases are share-alike.
 */
import fs from "node:fs";
import path from "node:path";
import { buildReference, centerline, insertVias, sliceByChainage } from "./route-projection";

type LngLat = [number, number];

interface OverpassWay {
  type: "way";
  id: number;
  geometry: Array<{ lat: number; lon: number }>;
}

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function argsAll(flag: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === flag) out.push(process.argv[i + 1]);
  });
  return out;
}

function dist(a: LngLat, b: LngLat): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Greedy nearest-endpoint stitching of way polylines into strands. */
export function stitch(ways: LngLat[][], joinThresholdDeg = 0.02): LngLat[][] {
  const remaining = ways.map((w) => [...w]);
  const strands: LngLat[][] = [];
  while (remaining.length > 0) {
    let strand = remaining.pop()!;
    let extended = true;
    while (extended) {
      extended = false;
      let best = { i: -1, end: 0, flip: false, d: joinThresholdDeg };
      const head = strand[0];
      const tail = strand[strand.length - 1];
      remaining.forEach((w, i) => {
        const wh = w[0];
        const wt = w[w.length - 1];
        const candidates: Array<[number, number, boolean]> = [
          [dist(tail, wh), 1, false], // append as-is
          [dist(tail, wt), 1, true], // append flipped
          [dist(head, wt), 0, false], // prepend as-is
          [dist(head, wh), 0, true], // prepend flipped
        ];
        for (const [d, end, flip] of candidates) {
          if (d < best.d) best = { i, end, flip, d };
        }
      });
      if (best.i >= 0) {
        let seg = remaining.splice(best.i, 1)[0];
        if (best.flip) seg = [...seg].reverse();
        strand =
          best.end === 1
            ? [...strand, ...seg.slice(1)]
            : [...seg.slice(0, -1), ...strand];
        extended = true;
      }
    }
    strands.push(strand);
  }
  return strands;
}

/** Ramer–Douglas–Peucker simplification (degrees epsilon). */
export function simplify(points: LngLat[], epsilon: number): LngLat[] {
  if (points.length <= 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let maxD = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i], first, last);
    if (d > maxD) {
      maxD = d;
      index = i;
    }
  }
  if (maxD <= epsilon) return [first, last];
  const left = simplify(points.slice(0, index + 1), epsilon);
  const right = simplify(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

function perpendicularDist(p: LngLat, a: LngLat, b: LngLat): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  const proj: LngLat = [a[0] + t * dx, a[1] + t * dy];
  return dist(p, proj);
}

/** Index of the vertex nearest to a point. */
export function nearestVertex(line: LngLat[], p: LngLat): number {
  let best = 0;
  let bestD = Infinity;
  line.forEach((v, i) => {
    const d = dist(v, p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Sub-polyline between the vertices nearest to `from` and `to`. */
export function slice(line: LngLat[], from: LngLat, to: LngLat): LngLat[] {
  let i = nearestVertex(line, from);
  let j = nearestVertex(line, to);
  if (i > j) [i, j] = [j, i];
  return line.slice(i, j + 1);
}

/**
 * Slice a section from the strand whose vertices come closest to both
 * endpoints (routes with construction gaps produce several strands).
 */
export function sliceBestStrand(
  strands: LngLat[][],
  from: LngLat,
  to: LngLat,
): LngLat[] {
  let best: LngLat[] = [];
  let bestD = Infinity;
  for (const strand of strands) {
    const d =
      dist(strand[nearestVertex(strand, from)], from) +
      dist(strand[nearestVertex(strand, to)], to);
    if (d < bestD) {
      bestD = d;
      best = strand;
    }
  }
  return slice(best, from, to);
}

function parseSection(spec: string): {
  ref: string;
  from: LngLat;
  to: LngLat;
} {
  const [ref, fromSpec, toSpec] = spec.split(":");
  const parse = (s: string): LngLat => {
    const [lng, lat] = s.split(",").map(Number);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      throw new Error(`bad coordinate "${s}" in section "${spec}"`);
    }
    return [lng, lat];
  };
  if (!ref || !fromSpec || !toSpec) {
    throw new Error(
      `bad --section "${spec}", expected ref:fromLng,fromLat:toLng,toLat`,
    );
  }
  return { ref, from: parse(fromSpec), to: parse(toSpec) };
}

async function main() {
  const country = arg("--country") ?? "ro";
  const ref = arg("--ref");
  const highway = arg("--highway") ?? "motorway";
  const out = arg("--out");
  const sectionSpecs = argsAll("--section");
  const dryRun = process.argv.includes("--dry-run");
  const maxLateral = Number(arg("--max-lateral") ?? "0.5");
  const fromCache = arg("--from-cache");
  const cacheFile = arg("--cache");

  if (!ref || !out) {
    console.error(
      "usage: fetch-osm-geometry.ts --country RO --ref A2 --out data/geo/ro/a2.geojson [--highway motorway] [--section ref:fromLng,fromLat:toLng,toLat ...] [--dry-run]",
    );
    process.exit(1);
  }

  const query = `
[out:json][timeout:180];
area["ISO3166-1"="${country.toUpperCase()}"][admin_level=2]->.a;
way(area.a)["highway"="${highway}"]["ref"="${ref}"];
out geom;
`;
  const includeConstruction = process.argv.includes("--also-construction");
  const constructionQuery = `
[out:json][timeout:180];
area["ISO3166-1"="${country.toUpperCase()}"][admin_level=2]->.a;
way(area.a)["highway"="construction"]["construction"="${highway}"]["ref"="${ref}"];
out geom;
`;
  console.log(`Fetching ways for ${highway} ref=${ref} in ${country}…`);
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "InfraWorldWide-data-bootstrap/0.1 (github.com)",
    Accept: "application/json",
  };
  async function overpass(q: string): Promise<OverpassWay[]> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const url = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length];
      try {
        const res = await fetch(url, {
          method: "POST",
          body: `data=${encodeURIComponent(q)}`,
          headers,
        });
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        return ((await res.json()) as { elements: OverpassWay[] }).elements;
      } catch (e) {
        lastError = e as Error;
        const wait = 2000 * (attempt + 1);
        console.warn(`  ${url} failed (${lastError.message}); retrying in ${wait / 1000}s…`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw lastError ?? new Error("Overpass failed");
  }
  let elements: OverpassWay[];
  if (fromCache) {
    elements = JSON.parse(fs.readFileSync(fromCache, "utf8"));
    console.log(`  loaded ${elements.length} elements from cache ${fromCache}`);
  } else {
    elements = [
      ...(await overpass(query)),
      ...(includeConstruction ? await overpass(constructionQuery) : []),
    ];
    if (cacheFile) {
      fs.writeFileSync(cacheFile, JSON.stringify(elements));
      console.log(`  cached ${elements.length} elements to ${cacheFile}`);
    }
  }
  const ways = elements
    .filter((e) => e.type === "way" && e.geometry?.length >= 2)
    .map((e) => e.geometry.map((g) => [g.lon, g.lat] as LngLat));
  console.log(`  ${ways.length} ways`);

  const strands = stitch(ways);
  strands.sort((a, b) => b.length - a.length);
  console.log(
    `  stitched into ${strands.length} strand(s); longest ${strands[0]?.length ?? 0} vertices`,
  );

  const sections = sectionSpecs.map(parseSection);

  if (sections.length > 0) {
    // Chainage-projection slicing: robust against dual-carriageway zigzag.
    // The reference polyline is the chain of section endpoints in the order
    // given — keep sections granular on curvy routes so the reference
    // follows the road's big bends.
    const waypoints: LngLat[] = [sections[0].from];
    for (const s of sections) waypoints.push(s.to);
    // Extra corridor waypoints where the road bends between section ends.
    const vias = argsAll("--via").map((s): LngLat => {
      const [lng, lat] = s.split(",").map(Number);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        throw new Error(`bad --via "${s}", expected lng,lat`);
      }
      return [lng, lat];
    });
    const ref = buildReference(insertVias(waypoints, vias));
    const line = centerline(ways.flat(), ref, 0.005, maxLateral);
    console.log(
      `  centerline: ${line.length} bins over ${ref.length.toFixed(2)}° of route`,
    );
    if (dryRun) return;

    const features = sections.map((s) => ({
      type: "Feature" as const,
      properties: { geometryRef: s.ref, _source: "OSM" },
      geometry: {
        type: "LineString" as const,
        coordinates: sliceByChainage(line, ref, s.from, s.to),
      },
    }));
    for (const f of features) {
      if (f.geometry.coordinates.length < 2) {
        console.warn(
          `  ⚠ section "${f.properties.geometryRef}" produced <2 vertices — check endpoint coords`,
        );
      }
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      JSON.stringify({ type: "FeatureCollection", features }, null, 2),
    );
    console.log(`  wrote ${features.length} feature(s) to ${out}`);
    console.log(
      "  reminder: geometry derived from OSM (ODbL) — keep attribution and cite OSM in project sources.",
    );
    return;
  }

  const simplified = strands.map((s) => simplify(s, 0.002));
  console.log(
    `  simplified to ${simplified.reduce((n, s) => n + s.length, 0)} vertices across strands`,
  );

  if (dryRun) return;

  const features = [
    {
      type: "Feature" as const,
      properties: { geometryRef: "full", _source: "OSM" },
      geometry: {
        type: "MultiLineString" as const,
        coordinates: simplified,
      },
    },
  ];

  for (const f of features) {
    if (f.geometry.coordinates.length < 2) {
      console.warn(
        `  ⚠ section "${f.properties.geometryRef}" produced <2 vertices — check endpoint coords`,
      );
    }
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify({ type: "FeatureCollection", features }, null, 2),
  );
  console.log(`  wrote ${features.length} feature(s) to ${out}`);
  console.log(
    "  reminder: geometry derived from OSM (ODbL) — keep attribution and cite OSM in project sources.",
  );
}

if (process.argv[1] && process.argv[1].endsWith("fetch-osm-geometry.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
