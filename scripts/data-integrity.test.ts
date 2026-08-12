import { describe, it, expect } from "vitest";
import { collectErrors } from "./validate-data";

/**
 * Integration test: every project file committed under data/projects must
 * validate against the schema and have matching geometry. Runs against the
 * real repo data so a bad data edit fails `npm test` too, not just builds.
 */
describe("seed data integrity", () => {
  it("all committed projects validate with zero errors", () => {
    const { projects, errors } = collectErrors(process.cwd());
    expect(errors).toEqual([]);
    expect(projects.length).toBeGreaterThan(0);
  });

  /**
   * The map needs an outline to make a country clickable and a reference row
   * to show its densities. collectErrors reports both, so this only has to
   * assert the table is actually populated — a countries.json that parsed
   * but held nothing would otherwise pass the check above.
   */
  it("every country with projects has area and population figures", () => {
    const { projects, countries } = collectErrors(process.cwd());
    const used = [...new Set(projects.map((p) => p.country))].sort();
    expect(Object.keys(countries?.countries ?? {}).sort()).toEqual(used);
  });
});
