/**
 * Pulls date tags from OpenStreetMap for a country's numbered routes and
 * reports them for manual review:
 *
 *   npx tsx scripts/fetch-osm-dates.ts --country ro
 *   npx tsx scripts/fetch-osm-dates.ts --country ro --ref A7
 *
 * A mapper editing a date in OSM is a signal worth reviewing, so the harvest
 * can also be snapshotted and compared:
 *
 *   npx tsx scripts/fetch-osm-dates.ts --country ro --write   # save a baseline
 *   npx tsx scripts/fetch-osm-dates.ts --country ro --diff    # what moved
 *   npx tsx scripts/fetch-osm-dates.ts --country ro --check   # exit 1 if any
 *
 * The snapshot lives in data/osm-dates/<cc>.json and is a record of what OSM
 * said, not data the site reads. Dates still get reviewed against a second
 * source before they land in data/projects.
 *
 * OSM tags these consistently enough to be a useful cross-check:
 *   start_date                  — year the section opened (on finished roads)
 *   opening_date                — announced opening
 *   construction:opening_date   — announced opening of works in progress
 *
 * OSM is ODbL: keep the "© OpenStreetMap contributors" attribution and cite
 * it in a project's `sources` when you take a date from here. Output is
 * deliberately a report, not an automatic write — dates still get reviewed
 * against a second source before landing in data/projects.
 */

import fs from "node:fs";
import path from "node:path";
import { diffRecords, formatDiff, hasChanges } from "../src/lib/record-diff";

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const DATE_TAGS = [
  "start_date",
  "opening_date",
  "construction:opening_date",
] as const;

interface OverpassElement {
  tags?: Record<string, string>;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function overpass(query: string): Promise<OverpassElement[]> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "InfraWorldWide-data-bootstrap/0.1 (github.com)",
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = (await res.json()) as { elements: OverpassElement[] };
      return json.elements;
    } catch (e) {
      lastError = e as Error;
      const wait = 2000 * (attempt + 1);
      console.warn(
        `  ${url} failed (${lastError.message}); retrying in ${wait / 1000}s…`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError ?? new Error("Overpass failed");
}

/**
 * One row per route, tag and value, which is how a reviewer reads them: "A7
 * construction:opening_date=2026 covers these four named sections". Keying on
 * the value means a mapper changing 2026 to 2027 shows as one row gone and one
 * arrived, rather than as a field edit whose old value is easy to miss.
 */
export interface OsmDateRecord {
  ref: string;
  tag: string;
  value: string;
  ways: number;
  names: string;
}

export function dateRecords(
  elements: OverpassElement[],
): Record<string, OsmDateRecord> {
  const out: Record<string, OsmDateRecord> = {};
  const names = new Map<string, Set<string>>();

  for (const el of elements) {
    const tags = el.tags ?? {};
    const ref = tags.ref ?? "(no ref)";
    for (const tag of DATE_TAGS) {
      const value = tags[tag];
      if (!value) continue;
      const key = `${ref}|${tag}=${value}`;
      const record = (out[key] ??= { ref, tag, value, ways: 0, names: "" });
      record.ways++;
      const seen = names.get(key) ?? new Set<string>();
      if (tags.name) seen.add(tags.name);
      names.set(key, seen);
    }
  }

  for (const [key, seen] of names) {
    out[key].names = [...seen].sort().join(", ");
  }
  return out;
}

function snapshotPath(
  root: string,
  country: string,
  ref: string | undefined,
): string {
  const suffix = ref ? `-${ref.toLowerCase()}` : "";
  return path.join(
    root,
    "data/osm-dates",
    `${country.toLowerCase()}${suffix}.json`,
  );
}

function readSnapshot(file: string): Record<string, OsmDateRecord> | null {
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
      records?: Record<string, OsmDateRecord>;
    };
    return parsed.records ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const country = (arg("--country") ?? "ro").toUpperCase();
  const ref = arg("--ref");
  const diffOnly = process.argv.includes("--diff");
  const check = process.argv.includes("--check");
  const write = process.argv.includes("--write");
  const refFilter = ref ? `["ref"="${ref}"]` : `["ref"~"^(A|DEx|DN)[0-9]"]`;

  // One clause per date tag: Overpass has no "has any of these keys" operator.
  const clauses = DATE_TAGS.map(
    (tag) => `way(area.a)${refFilter}["${tag}"];`,
  ).join("\n  ");
  const query = `
[out:json][timeout:140];
area["ISO3166-1"="${country}"][admin_level=2]->.a;
(
  ${clauses}
);
out tags;
`;

  console.log(
    `Fetching OSM date tags for ${country}${ref ? ` ref=${ref}` : ""}…`,
  );
  const elements = await overpass(query);
  console.log(`  ${elements.length} way(s) carrying a date tag`);

  const records = dateRecords(elements);
  const root = process.cwd();
  const file = snapshotPath(root, country, ref);
  const attribution =
    "\nOSM data is ODbL: cite OpenStreetMap in the project's sources for any date taken from here.";

  if (diffOnly || check) {
    const before = readSnapshot(file);
    if (!before) {
      console.log(
        `No committed snapshot at ${path.relative(root, file)}. Run with --write to record the current tags as the baseline.`,
      );
      if (check) process.exit(1);
      return;
    }
    const diff = diffRecords(before, records);
    console.log(
      formatDiff(diff, {
        label: "OSM date tag",
        summaryFields: ["ways", "names"],
      }),
    );
    console.log(attribution);
    if (check && hasChanges(diff)) {
      console.log(
        `OSM differs from ${path.relative(root, file)}. Review the dates against a second source, then rerun with --write.`,
      );
      process.exit(1);
    }
    return;
  }

  if (write) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      `${JSON.stringify(
        {
          country,
          ref: ref ?? null,
          note: "Snapshot of OpenStreetMap date tags, for diffing later. Not read by the site. OSM is ODbL: cite OpenStreetMap for any date taken from here.",
          records,
        },
        null,
        2,
      )}\n`,
    );
    console.log(
      `Wrote ${Object.keys(records).length} row(s) to ${path.relative(root, file)}`,
    );
    console.log(attribution);
    return;
  }

  // ref, then tag=value, then the named sections carrying it.
  const byRef = new Map<string, OsmDateRecord[]>();
  for (const record of Object.values(records)) {
    byRef.set(record.ref, [...(byRef.get(record.ref) ?? []), record]);
  }
  for (const routeRef of [...byRef.keys()].sort()) {
    console.log(`\n${routeRef}`);
    const rows = byRef
      .get(routeRef)!
      .sort((a, b) =>
        `${a.tag}=${a.value}`.localeCompare(`${b.tag}=${b.value}`),
      );
    for (const row of rows) {
      const names = row.names
        .split(", ")
        .filter(Boolean)
        .slice(0, 4)
        .join(", ");
      console.log(`  ${row.tag}=${row.value}${names ? `  : ${names}` : ""}`);
    }
  }
  console.log(attribution);
}

if (process.argv[1] && process.argv[1].endsWith("fetch-osm-dates.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
