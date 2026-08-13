import fs from "node:fs";
import path from "node:path";
import type {
  CityTable,
  ContractorRegistry,
  CountryTable,
  DeflatorTable,
  FxTable,
  Project,
} from "./schema";

/** Server-side readers for the build-time data artifacts in public/data. */

function readArtifact<T>(name: string): T {
  const file = path.join(process.cwd(), "public/data", name);
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function getProjects(): Project[] {
  return readArtifact<{ projects: Project[] }>("projects.json").projects;
}

/** Price indices used to compare costs across price years. */
export function getDeflators(): DeflatorTable {
  return readArtifact<DeflatorTable>("deflators.json");
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
