import fs from "node:fs";
import path from "node:path";
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

/** One city by the key `Project.city` references, or undefined. */
export function getCity(key: string) {
  return getCityTable().cities[key];
}

export function getCountries(): string[] {
  return [...new Set(getProjects().map((p) => p.country))].sort();
}

/**
 * Projects shown on the main map: everything not scoped to a city.
 *
 * The main map is a country-scale view. A metro line drawn at that zoom is
 * a few pixels of noise sitting on top of the motorway network, so city
 * work lives on the city's own page instead.
 */
export function getMapProjects(): Project[] {
  return getProjects().filter((p) => !p.city);
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
