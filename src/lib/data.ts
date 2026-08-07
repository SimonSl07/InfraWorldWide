import fs from "node:fs";
import path from "node:path";
import type { Project } from "./schema";

/** Server-side readers for the build-time data artifacts in public/data. */

export function getProjects(): Project[] {
  const file = path.join(process.cwd(), "public/data/projects.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
    projects: Project[];
  };
  return parsed.projects;
}

export function getProject(id: string): Project | undefined {
  return getProjects().find((p) => p.id === id);
}

export function getCountries(): string[] {
  return [...new Set(getProjects().map((p) => p.country))].sort();
}
