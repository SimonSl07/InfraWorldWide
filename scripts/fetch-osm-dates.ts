/**
 * Pulls date tags from OpenStreetMap for a country's numbered routes and
 * reports them for manual review:
 *
 *   npx tsx scripts/fetch-osm-dates.ts --country ro
 *   npx tsx scripts/fetch-osm-dates.ts --country ro --ref A7
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
      console.warn(`  ${url} failed (${lastError.message}); retrying in ${wait / 1000}s…`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError ?? new Error("Overpass failed");
}

async function main() {
  const country = (arg("--country") ?? "ro").toUpperCase();
  const ref = arg("--ref");
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

  console.log(`Fetching OSM date tags for ${country}${ref ? ` ref=${ref}` : ""}…`);
  const elements = await overpass(query);
  console.log(`  ${elements.length} way(s) carrying a date tag`);

  // ref → tag=value → set of section names, so a lot can be identified.
  const grouped = new Map<string, Map<string, Set<string>>>();
  for (const el of elements) {
    const tags = el.tags ?? {};
    const routeRef = tags.ref ?? "(no ref)";
    for (const tag of DATE_TAGS) {
      const value = tags[tag];
      if (!value) continue;
      const byValue = grouped.get(routeRef) ?? new Map<string, Set<string>>();
      const key = `${tag}=${value}`;
      const names = byValue.get(key) ?? new Set<string>();
      if (tags.name) names.add(tags.name);
      byValue.set(key, names);
      grouped.set(routeRef, byValue);
    }
  }

  for (const routeRef of [...grouped.keys()].sort()) {
    console.log(`\n${routeRef}`);
    const byValue = grouped.get(routeRef)!;
    for (const key of [...byValue.keys()].sort()) {
      const names = [...byValue.get(key)!].slice(0, 4);
      console.log(`  ${key}${names.length ? `  — ${names.join(", ")}` : ""}`);
    }
  }
  console.log(
    "\nOSM data is ODbL: cite OpenStreetMap in the project's sources for any date taken from here.",
  );
}

if (process.argv[1] && process.argv[1].endsWith("fetch-osm-dates.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
