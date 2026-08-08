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
  contractorRegistrySchema,
  deflatorTableSchema,
  projectSchema,
  projectGeoPath,
  type ContractorRegistry,
  type DeflatorTable,
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

  return { projects, deflators, contractors, errors };
}

export interface ValidatedData {
  projects: Project[];
  deflators: DeflatorTable;
  contractors: ContractorRegistry;
}

export function validateAll(root: string): ValidatedData {
  const { projects, deflators, contractors, errors } = collectErrors(root);
  if (errors.length > 0 || !deflators || !contractors) {
    console.error(`Data validation failed with ${errors.length} error(s):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  console.log(
    `✓ ${projects.length} project(s), ${Object.keys(deflators.series).length} deflator series, ${contractors.contractors.length} contractor entries validated`,
  );
  return { projects, deflators, contractors };
}

if (process.argv[1] && process.argv[1].endsWith("validate-data.ts")) {
  validateAll(process.cwd());
}
