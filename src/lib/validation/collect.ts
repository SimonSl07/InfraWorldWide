/**
 * Runs every check over a repository root and gathers the findings in two
 * tiers. Errors are unambiguous defects and fail the build; warnings are
 * things where the data might be right and a reader should judge.
 */
import fs from "node:fs";
import path from "node:path";
import {
  cityTableSchema,
  contractorRegistrySchema,
  corridorTableSchema,
  countryTableSchema,
  deflatorTableSchema,
  operatorTableSchema,
  programmeTableSchema,
  fxTableSchema,
  projectSchema,
  projectGeoPath,
  type CityTable,
  type ContractorRegistry,
  type CorridorTable,
  type CountryTable,
  type OperatorTable,
  type ProgrammeTable,
  type DeflatorTable,
  type FxTable,
  type Project,
} from "../schema";
import { checkProjectGeometry, type GeoFeature } from "./geometry";
import { checkEvents, checkStatusDates } from "./history";
import { checkEmDashes, checkLocaleKeys, knownLocales, walk } from "./locale";
import { checkCostPerKm, checkCostRevisions, checkPriceCoverage } from "./money";
import {
  checkCities,
  checkContractors,
  checkCountries,
  checkDeflators,
  checkFxCoverage,
  checkPartOf,
  checkReferenceKeys,
  checkSharedTrack,
  readReferenceFile,
} from "./references";
import { checkLotContractors, checkSourceQuality, type GeoReader } from "./sources";

export interface ValidationResult {
  projects: Project[];
  deflators: DeflatorTable | null;
  contractors: ContractorRegistry | null;
  countries: CountryTable | null;
  fx: FxTable | null;
  cities: CityTable | null;
  corridors: CorridorTable | null;
  programmes: ProgrammeTable | null;
  operators: OperatorTable | null;
  errors: string[];
  /** Non-blocking findings: reported, but they do not fail the build. */
  warnings: string[];
}

export interface ValidationOptions {
  /**
   * The date "now" is taken to be, as YYYY-MM-DD. Injected so a rule about
   * elapsed deadlines is testable and does not change meaning overnight.
   */
  today?: string;
}

export function collectErrors(
  root: string,
  options: ValidationOptions = {},
): ValidationResult {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const projectsDir = path.join(root, "data/projects");
  const projects: Project[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
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

  const corridors = readReferenceFile<CorridorTable>(
    root,
    "data/corridors.json",
    corridorTableSchema,
    errors,
  );

  const programmes = readReferenceFile<ProgrammeTable>(
    root,
    "data/programmes.json",
    programmeTableSchema,
    errors,
  );

  const operators = readReferenceFile<OperatorTable>(
    root,
    "data/operators.json",
    operatorTableSchema,
    errors,
  );

  for (const file of walk(projectsDir)) {
    const rel = path.relative(root, file);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      errors.push(`${rel}: invalid JSON: ${(e as Error).message}`);
      continue;
    }

    const parsed = projectSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${rel}: ${issue.path.join(".")}: ${issue.message}`);
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

    // Cross-check geometry references, and the geometry behind them.
    const geoRel = projectGeoPath(project);
    const geoPath = path.join(root, geoRel);
    if (!fs.existsSync(geoPath)) {
      errors.push(`${rel}: missing geometry file ${geoRel}`);
    } else {
      let geo: { features?: GeoFeature[] };
      try {
        geo = JSON.parse(fs.readFileSync(geoPath, "utf8"));
      } catch (e) {
        errors.push(`${rel}: invalid GeoJSON: ${(e as Error).message}`);
        continue;
      }
      const report = checkProjectGeometry(project, geo, geoRel);
      errors.push(...report.errors);
      warnings.push(...report.warnings);
    }

    projects.push(project);
  }

  checkCountries(countries, projects, root, errors);
  checkCities(cities, projects, errors);
  checkSharedTrack(projects, errors);
  checkFxCoverage(fx, projects, errors);

  const readGeo: GeoReader = (project) => {
    const file = path.join(root, projectGeoPath(project));
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  };

  for (const report of [
    checkStatusDates(projects, today),
    checkPriceCoverage(deflators, fx, projects),
    checkLotContractors(contractors, projects),
    checkCostPerKm(fx, projects),
    checkSourceQuality(projects, readGeo),
    checkReferenceKeys(corridors, programmes, operators, projects),
    checkPartOf(projects),
    checkCostRevisions(projects),
    checkEvents(projects),
  ]) {
    errors.push(...report.errors);
    warnings.push(...report.warnings);
  }
  errors.push(...checkEmDashes(root, ["data", "messages"]));

  // Locale vocabulary, across every data file rather than projects only:
  // the reference tables carry localized labels too.
  const locales = knownLocales(root);
  for (const file of walk(path.join(root, "data"))) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    try {
      errors.push(
        ...checkLocaleKeys(JSON.parse(fs.readFileSync(file, "utf8")), rel, locales),
      );
    } catch {
      // A parse failure is already reported by whichever check owns the file.
    }
  }

  return {
    projects,
    deflators,
    contractors,
    countries,
    fx,
    cities,
    corridors,
    programmes,
    operators,
    errors,
    warnings,
  };
}

export interface ValidatedData {
  projects: Project[];
  deflators: DeflatorTable;
  contractors: ContractorRegistry;
  countries: CountryTable;
  fx: FxTable;
  cities: CityTable;
  corridors: CorridorTable;
  programmes: ProgrammeTable;
  operators: OperatorTable;
}

export function validateAll(root: string): ValidatedData {
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
    errors,
    warnings,
  } = collectErrors(root);

  // Printed before the error block so a failing build still shows them, and
  // printed in full rather than counted so the gap stays visible in CI logs.
  if (warnings.length > 0) {
    console.warn(`${warnings.length} warning(s):`);
    for (const w of warnings) console.warn(`  ! ${w}`);
  }

  if (
    errors.length > 0 ||
    !deflators ||
    !contractors ||
    !countries ||
    !fx ||
    !cities ||
    !corridors ||
    !programmes ||
    !operators
  ) {
    console.error(`Data validation failed with ${errors.length} error(s):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  console.log(
    `✓ ${projects.length} project(s), ${Object.keys(deflators.series).length} deflator series, ${Object.keys(fx.rates).length} fx series, ${contractors.contractors.length} contractor entries, ${Object.keys(countries.countries).length} countries, ${Object.keys(cities.cities).length} cities validated`,
  );
  return {
    projects,
    deflators,
    contractors,
    countries,
    fx,
    cities,
    corridors,
    programmes,
    operators,
  };
}
