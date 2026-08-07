/**
 * Validates every project file in data/projects/** against the zod schema
 * and cross-checks that each lot's geometryRef exists in the project's
 * GeoJSON file. Exits non-zero on any error so builds fail loudly.
 */
import fs from "node:fs";
import path from "node:path";
import { projectSchema, projectGeoPath, type Project } from "../src/lib/schema";

interface GeoFeature {
  properties?: { geometryRef?: string } | null;
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
  errors: string[];
}

export function collectErrors(root: string): ValidationResult {
  const projectsDir = path.join(root, "data/projects");
  const projects: Project[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();

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

  return { projects, errors };
}

export function validateAll(root: string): Project[] {
  const { projects, errors } = collectErrors(root);
  if (errors.length > 0) {
    console.error(`Data validation failed with ${errors.length} error(s):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  console.log(`✓ ${projects.length} project(s) validated`);
  return projects;
}

if (process.argv[1] && process.argv[1].endsWith("validate-data.ts")) {
  validateAll(process.cwd());
}
