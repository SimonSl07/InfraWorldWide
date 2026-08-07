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
});
