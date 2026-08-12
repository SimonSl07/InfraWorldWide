import fs from "node:fs";
import path from "node:path";
import type {
  ContractorRegistry,
  CountryTable,
  DeflatorTable,
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

export function getProject(id: string): Project | undefined {
  return getProjects().find((p) => p.id === id);
}

export function getCountries(): string[] {
  return [...new Set(getProjects().map((p) => p.country))].sort();
}
