/**
 * Reports what the curated data is still missing:
 *
 *   npx tsx scripts/report-gaps.ts                       # table, high first
 *   npx tsx scripts/report-gaps.ts --format csv > gaps.csv
 *   npx tsx scripts/report-gaps.ts --format json --priority high
 *   npx tsx scripts/report-gaps.ts --include-known       # settled dead ends too
 *   npx tsx scripts/report-gaps.ts --summary             # counts per rule only
 *
 * This replaces a hand-run spreadsheet (data-gaps.csv) that nothing could
 * regenerate. The rules live in src/lib/gaps.ts and are unit-tested there;
 * this file only reads the data and prints.
 *
 * Every row is a research task, not a defect, so the exit code is always 0.
 * Nothing here fails a build. Use --priority high in a scheduled job and read
 * the diff instead.
 */
import fs from "node:fs";
import path from "node:path";
import {
  deflatorTableSchema,
  fxTableSchema,
  projectSchema,
  type DeflatorTable,
  type FxTable,
  type Project,
} from "../src/lib/schema";
import { findGaps, type GapPriority } from "../src/lib/gaps";
import {
  atLeastPriority,
  knownGapsSchema,
  partitionKnown,
  summarise,
  toCsv,
  toJson,
  toTable,
  type KnownGap,
} from "../src/lib/gap-report";

const PRIORITIES: GapPriority[] = ["high", "medium", "low", "info"];

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".json")) yield full;
  }
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Loads the data directly rather than through validate-data.ts: a gap report
 * has to work on a tree that does not fully validate, which is exactly when
 * someone is mid-edit and wants to know what is still missing.
 */
function loadProjects(root: string): Project[] {
  const projects: Project[] = [];
  for (const file of walk(path.join(root, "data/projects"))) {
    const parsed = projectSchema.safeParse(readJson(file));
    if (parsed.success) {
      projects.push(parsed.data);
    } else {
      console.warn(
        `! skipping ${path.relative(root, file)}: does not match the schema (run npm run data:validate)`,
      );
    }
  }
  return projects.sort((a, b) => a.id.localeCompare(b.id));
}

function loadKnownGaps(root: string): KnownGap[] {
  const file = path.join(root, "data/known-gaps.json");
  if (!fs.existsSync(file)) return [];
  const parsed = knownGapsSchema.safeParse(readJson(file));
  if (!parsed.success) {
    console.warn("! data/known-gaps.json does not match its schema; ignoring it");
    for (const issue of parsed.error.issues) {
      console.warn(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    return [];
  }
  return parsed.data.entries;
}

function main() {
  const root = process.cwd();
  const format = arg("--format") ?? "table";
  if (!["csv", "json", "table"].includes(format)) {
    console.error(`unknown --format "${format}" (expected csv, json or table)`);
    process.exit(2);
  }
  const priority = arg("--priority") as GapPriority | undefined;
  if (priority && !PRIORITIES.includes(priority)) {
    console.error(`unknown --priority "${priority}" (expected ${PRIORITIES.join(", ")})`);
    process.exit(2);
  }

  const projects = loadProjects(root);
  const deflators = deflatorTableSchema.parse(
    readJson(path.join(root, "data/deflators.json")),
  ) as DeflatorTable;
  const fx = fxTableSchema.parse(readJson(path.join(root, "data/fx.json"))) as FxTable;

  const today = (arg("--today") ?? new Date().toISOString()).slice(0, 7);
  const all = findGaps({ projects, deflators, fx, today });

  const known = flag("--include-known") ? [] : loadKnownGaps(root);
  const { open, suppressed, stale } = partitionKnown(all, known);
  const gaps = atLeastPriority(open, priority);

  if (flag("--summary")) {
    for (const row of summarise(gaps)) {
      console.log(
        `${String(row.count).padStart(4)}  ${row.priority.padEnd(6)} ${row.field.padEnd(26)} ${row.issue}`,
      );
    }
    console.log(`\n${gaps.length} gap(s) over ${projects.length} project(s)`);
    return;
  }

  if (format === "csv") {
    process.stdout.write(toCsv(gaps));
  } else if (format === "json") {
    process.stdout.write(
      toJson({
        generatedAt: today,
        gaps,
        suppressed: suppressed.map((s) => ({ gap: s.gap, reason: s.known.reason })),
      }),
    );
  } else {
    console.log(toTable(gaps));
    console.log(
      `\n${gaps.length} gap(s) over ${projects.length} project(s), ${projects.reduce((n, p) => n + p.lots.length, 0)} lot(s)`,
    );
    if (suppressed.length > 0) {
      console.log(
        `${suppressed.length} settled dead end(s) hidden; run with --include-known to see them.`,
      );
    }
    for (const pattern of stale) {
      console.log(
        `! data/known-gaps.json entry "${pattern}" matches nothing any more; delete it.`,
      );
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith("report-gaps.ts")) {
  // Piping into `head` closes stdout early; that is the caller reading less,
  // not an error worth a stack trace.
  process.stdout.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code !== "EPIPE") throw e;
  });
  main();
}
