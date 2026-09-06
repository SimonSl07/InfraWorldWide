import fs from "node:fs";
import path from "node:path";
import { createAnalysisContext, type AnalysisContext } from "./analysis-context";
import {
  buildContractorDirectory,
  type ContractorProfile,
} from "./contractor-directory";
import { collectLotMetrics, type LotMetric } from "./rankings";
import type {
  CityTable,
  ContractorRegistry,
  CountryTable,
  DeflatorTable,
  FxTable,
  Project,
  CorridorTable,
  ProgrammeTable,
  OperatorTable,
} from "./schema";

/** Server-side readers for the build-time data artifacts in public/data. */

/**
 * Artifacts are compiled once by `data:build` and never change while the
 * process lives, so each file is read and parsed once. Without this, a single
 * page render re-parsed the 350 KB projects.json several times, and a full
 * static build did it hundreds of times: getProject() alone re-read the whole
 * file to find one project, across 24 call sites.
 *
 * The cost is that `next dev` will not see a data edit until it restarts,
 * which was already true, since `predev` regenerates public/data on boot.
 */
const artifacts = new Map<string, unknown>();

function readArtifact<T>(name: string): T {
  const cached = artifacts.get(name);
  if (cached !== undefined) return cached as T;

  const file = path.join(process.cwd(), "public/data", name);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as T;
  artifacts.set(name, parsed);
  return parsed;
}

export function getProjects(): Project[] {
  return readArtifact<{ projects: Project[] }>("projects.json").projects;
}

/** Price indices used to compare costs across price years. */
export function getDeflators(): DeflatorTable {
  return readArtifact<DeflatorTable>("deflators.json");
}

/**
 * The alternative price basis: construction input costs rather than consumer
 * prices. A closer fit for civil works, and materially different, a 2013 RON
 * figure restated into 2022 prices lands 36% higher here than on HICP. It
 * covers fewer currencies and stops earlier, so it is offered alongside
 * rather than instead. See the note in the table itself.
 */
export function getConstructionDeflators(): DeflatorTable {
  return readArtifact<DeflatorTable>("deflators-construction.json");
}

/** Canonical contractor identities used by the by-contractor rankings. */
export function getContractors(): ContractorRegistry {
  return readArtifact<ContractorRegistry>("contractors.json");
}

/** Area and population per country, used for the density figures. */
export function getCountryTable(): CountryTable {
  return readArtifact<CountryTable>("countries.json");
}

/** Annual average exchange rates, used to put costs in one currency. */
export function getFxTable(): FxTable {
  return readArtifact<FxTable>("fx.json");
}

/** Cities that have their own view, keyed as Project.city references them. */
export function getCityTable(): CityTable {
  return readArtifact<CityTable>("cities.json");
}

export function getProject(id: string): Project | undefined {
  return getProjects().find((p) => p.id === id);
}

export function getCountries(): string[] {
  return [...new Set(getProjects().map((p) => p.country))].sort();
}

/** Projects belonging to one city. */
export function getCityProjects(city: string): Project[] {
  return getProjects().filter((p) => p.city === city);
}

/** City keys that actually have projects, sorted. */
export function getCityKeys(): string[] {
  return [
    ...new Set(
      getProjects()
        .map((p) => p.city)
        .filter((c): c is string => typeof c === "string"),
    ),
  ].sort();
}

/**
 * Corridors, funding programmes and procuring authorities.
 *
 * Reference tables in the same shape as the others. They are the axis the
 * three countries are actually comparable on, so they are emitted alongside
 * the projects rather than being validation-only.
 */
export function getCorridorTable(): CorridorTable {
  return readArtifact<CorridorTable>("corridors.json");
}

export function getProgrammeTable(): ProgrammeTable {
  return readArtifact<ProgrammeTable>("programmes.json");
}

export function getOperatorTable(): OperatorTable {
  return readArtifact<OperatorTable>("operators.json");
}

/**
 * The derived analysis, memoized the way the artifacts above are.
 *
 * A full static build renders every project, country and contractor page in
 * two locales, and each render used to rebuild the deflator, the converter,
 * the resolver and every lot's metrics from scratch. The contractor pages
 * did it three times per profile (params, metadata, page) for about a
 * hundred profiles. The inputs are the artifacts, which never change while
 * the process lives, and "now" as a month index, which is the only thing
 * that can differ between calls. So the month is the key, and outside a build
 * that straddles midnight on the first there is one entry.
 */
const analyses = new Map<number, AnalysisContext>();
const lotMetrics = new Map<number, LotMetric[]>();
const contractorProfiles = new Map<number, ContractorProfile[]>();

function memoByMonth<T>(
  cache: Map<number, T>,
  nowMonth: number,
  build: () => T,
): T {
  const cached = cache.get(nowMonth);
  if (cached !== undefined) return cached;
  const built = build();
  cache.set(nowMonth, built);
  return built;
}

/** The one price basis every page compares costs on. */
export function getAnalysisContext(nowMonth: number): AnalysisContext {
  return memoByMonth(analyses, nowMonth, () =>
    createAnalysisContext({
      deflators: getDeflators(),
      fx: getFxTable(),
      contractors: getContractors(),
      nowMonth,
    }),
  );
}

/**
 * Every lot's measured outcomes, on that basis. Callers filter this rather
 * than collecting metrics for a subset: a project page and the rankings must
 * show the same figure for the same lot.
 */
export function getLotMetrics(nowMonth: number): LotMetric[] {
  return memoByMonth(lotMetrics, nowMonth, () =>
    collectLotMetrics(
      getProjects(),
      getAnalysisContext(nowMonth).metricsOptions,
    ),
  );
}

/** One profile per firm named anywhere in the data, on the same basis. */
export function getContractorProfiles(nowMonth: number): ContractorProfile[] {
  return memoByMonth(contractorProfiles, nowMonth, () =>
    buildContractorDirectory(getProjects(), {
      ...getAnalysisContext(nowMonth).metricsOptions,
      registry: getContractors(),
    }),
  );
}
