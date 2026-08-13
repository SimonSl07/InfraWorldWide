/**
 * Validates every project file in data/projects/** against the zod schema
 * and cross-checks that each lot's geometryRef exists in the project's
 * GeoJSON file. Also validates the two reference tables the rankings depend
 * on — data/deflators.json and data/contractors.json. Exits non-zero on any
 * error so builds fail loudly.
 */
import fs from "node:fs";
import path from "node:path";
import {
  cityTableSchema,
  contractorRegistrySchema,
  countryGeoPath,
  countryTableSchema,
  deflatorTableSchema,
  fxTableSchema,
  projectSchema,
  projectGeoPath,
  type CityTable,
  type ContractorRegistry,
  type CountryTable,
  type DeflatorTable,
  type FxTable,
  type Project,
} from "../src/lib/schema";
import { contractorSlug } from "../src/lib/contractors";

interface GeoFeature {
  properties?: { geometryRef?: string } | null;
}

/** Parses and schema-checks a single reference file, collecting errors. */
function readReferenceFile<T>(
  root: string,
  rel: string,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { path: PropertyKey[]; message: string }[] } } },
  errors: string[],
): T | null {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    errors.push(`${rel}: missing`);
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`${rel}: invalid JSON — ${(e as Error).message}`);
    return null;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error!.issues) {
      errors.push(`${rel}: ${issue.path.join(".")} — ${issue.message}`);
    }
    return null;
  }
  return parsed.data!;
}

function checkDeflators(table: DeflatorTable, rel: string, errors: string[]) {
  for (const [currency, series] of Object.entries(table.series)) {
    if (Object.keys(series.index).length === 0) {
      errors.push(`${rel}: series "${currency}" has no index values`);
    }
  }
}

/**
 * A name or alias may only ever point at one firm — otherwise resolution
 * depends on registry order and rankings silently merge unrelated companies.
 */
function checkContractors(
  registry: ContractorRegistry,
  rel: string,
  errors: string[],
) {
  const ids = new Set<string>();
  const claimed = new Map<string, string>();

  for (const entry of registry.contractors) {
    if (ids.has(entry.id)) {
      errors.push(`${rel}: duplicate contractor id "${entry.id}"`);
    }
    ids.add(entry.id);

    if (entry.members?.includes(entry.id)) {
      errors.push(`${rel}: joint venture "${entry.id}" lists itself as a member`);
    }

    for (const key of [entry.name, ...(entry.aliases ?? [])]) {
      const slug = contractorSlug(key);
      const owner = claimed.get(slug);
      if (owner !== undefined && owner !== entry.id) {
        errors.push(
          `${rel}: "${key}" is claimed by both "${owner}" and "${entry.id}"`,
        );
      }
      claimed.set(slug, entry.id);
    }
  }
}

/**
 * Countries must line up in three places: the projects, the reference table
 * and the outline polygons. A country with projects but no outline is
 * unclickable on the map; one with an outline but no reference row renders a
 * panel with blank densities. Both directions are checked so neither can
 * drift silently when a country is added.
 */
function checkCountries(
  table: CountryTable | null,
  projects: Project[],
  root: string,
  errors: string[],
) {
  const used = [...new Set(projects.map((p) => p.country))].sort();

  for (const country of used) {
    if (table && !table.countries[country]) {
      errors.push(
        `data/countries.json: no entry for "${country}", which has projects`,
      );
    }
    const rel = countryGeoPath(country);
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) {
      errors.push(
        `${rel}: missing outline for "${country}" — run scripts/fetch-country-outlines.ts`,
      );
      continue;
    }
    let geo: { features?: Array<{ geometry?: { type?: string } | null }> };
    try {
      geo = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      errors.push(`${rel}: invalid GeoJSON — ${(e as Error).message}`);
      continue;
    }
    const polygons = (geo.features ?? []).filter(
      (f) =>
        f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
    );
    if (polygons.length === 0) {
      errors.push(`${rel}: no Polygon/MultiPolygon feature`);
    }
  }

  for (const country of Object.keys(table?.countries ?? {})) {
    if (!used.includes(country)) {
      errors.push(
        `data/countries.json: entry "${country}" has no projects — remove it or add its projects`,
      );
    }
  }
}

/**
 * Cities must line up with the projects placed in them, in both directions.
 * A project pointing at a city that does not exist would vanish from the
 * main map without appearing anywhere else; a city with no projects renders
 * an empty page. Both are silent failures, so both are errors here.
 */
function checkCities(
  table: CityTable | null,
  projects: Project[],
  errors: string[],
) {
  const used = [
    ...new Set(
      projects.map((p) => p.city).filter((c): c is string => c !== undefined),
    ),
  ].sort();

  for (const key of used) {
    const city = table?.cities[key];
    if (table && !city) {
      errors.push(
        `data/cities.json: no entry for "${key}", which has projects`,
      );
      continue;
    }
    // The city's country has to agree with the projects placed in it, or
    // the city page would list roads from somewhere else.
    for (const project of projects.filter((p) => p.city === key)) {
      if (city && project.country !== city.country) {
        errors.push(
          `${project.id}: city "${key}" is in "${city.country}" but the project is in "${project.country}"`,
        );
      }
    }
  }

  for (const key of Object.keys(table?.cities ?? {})) {
    if (!used.includes(key)) {
      errors.push(
        `data/cities.json: entry "${key}" has no projects — remove it or add its projects`,
      );
    }
  }
}

/**
 * A lot's `sharedWith` must name a real project that could actually own the
 * track. A dangling or self-referential pointer would silently subtract the
 * lot from every network total while nothing else counted it, which reads as
 * a shorter network rather than as an error.
 */
function checkSharedTrack(projects: Project[], errors: string[]) {
  const byId = new Map(projects.map((p) => [p.id, p]));

  for (const project of projects) {
    for (const lot of project.lots) {
      const target = lot.sharedWith;
      if (target === undefined) continue;

      if (target === project.id) {
        errors.push(
          `${project.id}: lot "${lot.id}" is sharedWith its own project`,
        );
        continue;
      }
      const owner = byId.get(target);
      if (!owner) {
        errors.push(
          `${project.id}: lot "${lot.id}" is sharedWith "${target}", which does not exist`,
        );
        continue;
      }
      // Track cannot be shared across a border, and a shared city lot whose
      // owner sits on the main map would vanish from both views.
      if (owner.country !== project.country) {
        errors.push(
          `${project.id}: lot "${lot.id}" is sharedWith "${target}" in a different country`,
        );
      }
      if (owner.city !== project.city) {
        errors.push(
          `${project.id}: lot "${lot.id}" is sharedWith "${target}", which is in a different city`,
        );
      }
    }
  }
}

/** Every currency a cost is recorded in must be convertible, or the cost
 *  tables silently drop it. Warns via an error so new data cannot slip in
 *  a currency the FX table has never heard of. */
function checkFxCoverage(
  table: FxTable | null,
  projects: Project[],
  errors: string[],
) {
  if (!table) return;
  const missing = new Set<string>();
  for (const project of projects) {
    for (const lot of project.lots) {
      for (const money of [
        lot.cost?.estimated,
        lot.cost?.actual,
        lot.contract?.value,
      ]) {
        if (!money) continue;
        if (money.currency === table.base) continue;
        if (!table.rates[money.currency]) missing.add(money.currency);
      }
    }
  }
  for (const currency of [...missing].sort()) {
    errors.push(
      `data/fx.json: no rates for "${currency}", which costs are recorded in`,
    );
  }
}

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".json")) yield full;
  }
}

export interface ValidationResult {
  projects: Project[];
  deflators: DeflatorTable | null;
  contractors: ContractorRegistry | null;
  countries: CountryTable | null;
  fx: FxTable | null;
  cities: CityTable | null;
  errors: string[];
}

export function collectErrors(root: string): ValidationResult {
  const projectsDir = path.join(root, "data/projects");
  const projects: Project[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();

  const deflators = readReferenceFile<DeflatorTable>(
    root,
    "data/deflators.json",
    deflatorTableSchema,
    errors,
  );
  if (deflators) checkDeflators(deflators, "data/deflators.json", errors);

  const contractors = readReferenceFile<ContractorRegistry>(
    root,
    "data/contractors.json",
    contractorRegistrySchema,
    errors,
  );
  if (contractors) {
    checkContractors(contractors, "data/contractors.json", errors);
  }

  const countries = readReferenceFile<CountryTable>(
    root,
    "data/countries.json",
    countryTableSchema,
    errors,
  );

  const fx = readReferenceFile<FxTable>(
    root,
    "data/fx.json",
    fxTableSchema,
    errors,
  );

  const cities = readReferenceFile<CityTable>(
    root,
    "data/cities.json",
    cityTableSchema,
    errors,
  );

  for (const file of walk(projectsDir)) {
    const rel = path.relative(root, file);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      errors.push(`${rel}: invalid JSON — ${(e as Error).message}`);
      continue;
    }

    const parsed = projectSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${rel}: ${issue.path.join(".")} — ${issue.message}`);
      }
      continue;
    }
    const project = parsed.data;

    if (seenIds.has(project.id)) {
      errors.push(`${rel}: duplicate project id "${project.id}"`);
    }
    seenIds.add(project.id);

    if (!project.id.startsWith(`${project.country}-`)) {
      errors.push(
        `${rel}: project id "${project.id}" must start with country code "${project.country}-"`,
      );
    }

    const lotIds = new Set<string>();
    for (const lot of project.lots) {
      if (lotIds.has(lot.id)) {
        errors.push(`${rel}: duplicate lot id "${lot.id}"`);
      }
      lotIds.add(lot.id);

      // Dates must run in the order they happen. An audit of this dataset
      // found several lots whose recorded construction start predated their
      // own tender award — the tell-tale of two different procurements
      // merged into one record, which silently corrupts every slip figure
      // derived from them.
      const d = lot.dates;
      const order: Array<[string, string | undefined]> = [
        ["announced", d?.announced],
        ["tenderAwarded", d?.tenderAwarded],
        ["constructionStart", d?.constructionStart],
        ["opened", d?.opened],
      ];
      const present = order.filter((e): e is [string, string] => Boolean(e[1]));
      for (let i = 1; i < present.length; i++) {
        const [prevName, prev] = present[i - 1];
        const [name, cur] = present[i];
        // Compare on the shared precision so "2019" vs "2019-03" is not a
        // false positive — only a genuine ordering violation should fail.
        const n = Math.min(prev.length, cur.length);
        if (cur.slice(0, n) < prev.slice(0, n)) {
          errors.push(
            `${rel}: lot "${lot.id}" has ${name} (${cur}) before ${prevName} (${prev})`,
          );
        }
      }
    }

    // Cross-check geometry references.
    const geoPath = path.join(root, projectGeoPath(project));
    if (!fs.existsSync(geoPath)) {
      errors.push(`${rel}: missing geometry file ${path.relative(root, geoPath)}`);
    } else {
      let geo: { features?: GeoFeature[] };
      try {
        geo = JSON.parse(fs.readFileSync(geoPath, "utf8"));
      } catch (e) {
        errors.push(`${rel}: invalid GeoJSON — ${(e as Error).message}`);
        continue;
      }
      const refs = new Set(
        (geo.features ?? [])
          .map((f) => f.properties?.geometryRef)
          .filter((r): r is string => typeof r === "string"),
      );
      for (const lot of project.lots) {
        if (!refs.has(lot.geometryRef)) {
          errors.push(
            `${rel}: lot "${lot.id}" references geometryRef "${lot.geometryRef}" not found in ${path.relative(root, geoPath)}`,
          );
        }
      }
    }

    projects.push(project);
  }

  checkCountries(countries, projects, root, errors);
  checkCities(cities, projects, errors);
  checkSharedTrack(projects, errors);
  checkFxCoverage(fx, projects, errors);

  return { projects, deflators, contractors, countries, fx, cities, errors };
}

export interface ValidatedData {
  projects: Project[];
  deflators: DeflatorTable;
  contractors: ContractorRegistry;
  countries: CountryTable;
  fx: FxTable;
  cities: CityTable;
}

export function validateAll(root: string): ValidatedData {
  const { projects, deflators, contractors, countries, fx, cities, errors } =
    collectErrors(root);
  if (
    errors.length > 0 ||
    !deflators ||
    !contractors ||
    !countries ||
    !fx ||
    !cities
  ) {
    console.error(`Data validation failed with ${errors.length} error(s):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  console.log(
    `✓ ${projects.length} project(s), ${Object.keys(deflators.series).length} deflator series, ${Object.keys(fx.rates).length} fx series, ${contractors.contractors.length} contractor entries, ${Object.keys(countries.countries).length} countries, ${Object.keys(cities.cities).length} cities validated`,
  );
  return { projects, deflators, contractors, countries, fx, cities };
}

if (process.argv[1] && process.argv[1].endsWith("validate-data.ts")) {
  validateAll(process.cwd());
}
