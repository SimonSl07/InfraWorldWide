/**
 * Reports what the curated data is still missing:
 *
 *   npx tsx scripts/report-gaps.ts                       # table, high first
 *   npx tsx scripts/report-gaps.ts --format csv > gaps.csv
 *   npx tsx scripts/report-gaps.ts --format json --priority high
 *   npx tsx scripts/report-gaps.ts --include-known       # settled dead ends too
 *   npx tsx scripts/report-gaps.ts --summary             # counts per rule only
 *   npx tsx scripts/report-gaps.ts --priority high --diff .gaps/high.json --write
 *
 * This replaces a hand-run spreadsheet (data-gaps.csv) that nothing could
 * regenerate. The rules live in src/lib/gaps.ts and are unit-tested there;
 * this file only reads the data and prints.
 *
 * Every row is a research task, not a defect, so the exit code is always 0.
 * Nothing here fails a build. Use --priority high in a scheduled job and read
 * the diff instead: --diff names a snapshot of what the last run listed and
 * prints what has appeared, been filled or been reworded since, and --write
 * moves the snapshot on. The daily news-digest workflow runs exactly that.
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
import { findGaps, type Gap, type GapPriority } from "../src/lib/gaps";
import { diffRecords, formatDiff } from "../src/lib/record-diff";
import {
  atLeastPriority,
  gapsByKey,
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

/**
 * What the last run listed. Kept out of data/, where the validators walk, and
 * out of git: it records what has already been reported, not anything about
 * the projects. The workflow keeps it in the Actions cache, like .news.
 */
interface GapSnapshot {
  note: string;
  generatedAt: string;
  /** The --priority the snapshot was taken at, so a diff cannot mix tiers. */
  priority: GapPriority | "all";
  records: Record<string, Gap>;
}

function readSnapshot(file: string): GapSnapshot | null {
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as GapSnapshot;
    return parsed.records ? parsed : null;
  } catch {
    // A corrupt snapshot costs one run's diff, which is recoverable.
    // Refusing to report is not.
    return null;
  }
}

function writeSnapshot(
  file: string,
  records: Record<string, Gap>,
  priority: GapPriority | "all",
  generatedAt: string,
): void {
  const snapshot: GapSnapshot = {
    note: "What the last gap report listed, so the next one can say what moved. Not site data.",
    generatedAt,
    priority,
    records,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
}

function loadKnownGaps(root: string): KnownGap[] {
  const file = path.join(root, "data/known-gaps.json");
  if (!fs.existsSync(file)) return [];
  const parsed = knownGapsSchema.safeParse(readJson(file));
  if (!parsed.success) {
    console.warn(
      "! data/known-gaps.json does not match its schema; ignoring it",
    );
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
    console.error(
      `unknown --priority "${priority}" (expected ${PRIORITIES.join(", ")})`,
    );
    process.exit(2);
  }

  const projects = loadProjects(root);
  const deflators = deflatorTableSchema.parse(
    readJson(path.join(root, "data/deflators.json")),
  ) as DeflatorTable;
  const fx = fxTableSchema.parse(
    readJson(path.join(root, "data/fx.json")),
  ) as FxTable;

  const today = (arg("--today") ?? new Date().toISOString()).slice(0, 7);
  const all = findGaps({ projects, deflators, fx, today });

  const known = flag("--include-known") ? [] : loadKnownGaps(root);
  const { open, suppressed, stale } = partitionKnown(all, known);
  const gaps = atLeastPriority(open, priority);

  const diffFile = arg("--diff");
  if (diffFile) {
    const file = path.resolve(root, diffFile);
    const tier: GapPriority | "all" = priority ?? "all";
    const records = gapsByKey(gaps);
    const before = readSnapshot(file);
    const writing = flag("--write");
    const rel = path.relative(root, file);
    // Only --write moves the snapshot, so neither message below may claim a
    // baseline was recorded when it was not.
    const baseline = writing
      ? "Recording this run as the baseline."
      : `Pass --write to record this run as the baseline (${gaps.length} ${tier} gap(s)).`;

    if (!before) {
      console.log(
        `No snapshot at ${rel}, so there is nothing to diff against yet. ${baseline}`,
      );
    } else if (before.priority !== tier) {
      // Diffing a high-only run against an all-tiers snapshot would report
      // every medium and low gap as filled, which is the opposite of true.
      console.log(
        `Snapshot ${rel} was taken at priority "${before.priority}" and this run is "${tier}". Skipping the diff: it would read as hundreds of gaps closing. ${baseline}`,
      );
    } else {
      console.log(
        formatDiff(diffRecords(before.records, records), {
          label: `${tier} gap`,
          summaryFields: ["priority", "field", "issue", "detail"],
          baseline: `the run of ${before.generatedAt}`,
        }),
      );
    }

    // The OSM snapshot waits for a person to approve it, because curated
    // dates are downstream of it. Nothing is downstream of this one, so a
    // scheduled job advances it in the same pass.
    if (writing) {
      writeSnapshot(file, records, tier, today);
      console.log(
        `\nSnapshot updated: ${gaps.length} ${tier} gap(s) at ${rel}.`,
      );
    }
    return;
  }

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
        suppressed: suppressed.map((s) => ({
          gap: s.gap,
          reason: s.known.reason,
        })),
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
