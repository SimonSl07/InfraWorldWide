/**
 * Validates every project file in data/projects/** against the zod schema,
 * cross-checks each lot's geometryRef against the project's GeoJSON, and
 * checks the reference tables the rankings depend on. Exits non-zero on any
 * error so builds fail loudly.
 *
 * The checks themselves live in src/lib/validation; this file is the CLI
 * entry point behind `npm run data:validate`, and re-exports the library so
 * a script importing from here keeps working.
 */
import { validateAll } from "../src/lib/validation";

export * from "../src/lib/validation";

if (process.argv[1] && process.argv[1].endsWith("validate-data.ts")) {
  validateAll(process.cwd());
}
