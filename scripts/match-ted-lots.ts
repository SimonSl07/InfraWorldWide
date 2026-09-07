/**
 * Matches a TED harvest to the lots in data/projects and emits a review CSV:
 *
 *   npx tsx scripts/fetch-ted-contracts.ts --country RO --out data/ted/ro.json --from 2024
 *   npx tsx scripts/match-ted-lots.ts --awards data/ted/ro.json > ted-review.csv
 *   npx tsx scripts/match-ted-lots.ts --awards data/ted/ro.json --format table --min high
 *
 * This is the "separate, reviewable step" fetch-ted-contracts.ts has always
 * promised. It stops one move short of writing: every row is a candidate with
 * a confidence, the place names behind it, and the fields the notice would
 * fill in. A person accepts or rejects it. Nothing under data/projects is
 * machine-edited, because a wrong match would put a cited figure on the wrong
 * road and nothing downstream would notice.
 *
 * Scope, stated plainly: TED carries contract durations and winners only on
 * eForms-era notices, in practice 2024 onward. For the 2018-2023 Romanian
 * motorway awards this dataset is mostly built from, TED has the award value
 * and nothing else, which is why the terms in data/projects come from press
 * and CNAIR reports instead.
 */
import fs from "node:fs";
import path from "node:path";
import { projectSchema, type Project } from "../src/lib/schema";
import {
  matchNotices,
  type MatchConfidence,
  type MatchRow,
  type TedNotice,
} from "../src/lib/ted-match";

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".json")) yield full;
  }
}

function loadProjects(root: string, country: string | undefined): Project[] {
  const projects: Project[] = [];
  for (const file of walk(path.join(root, "data/projects"))) {
    const parsed = projectSchema.safeParse(
      JSON.parse(fs.readFileSync(file, "utf8")),
    );
    if (!parsed.success) continue;
    if (country && parsed.data.country !== country) continue;
    projects.push(parsed.data);
  }
  return projects.sort((a, b) => a.id.localeCompare(b.id));
}

const COLUMNS: Array<keyof MatchRow> = [
  "confidence",
  "score",
  "project",
  "lot",
  "wouldAdd",
  "noticeValue",
  "noticeDuration",
  "winners",
  "publicationNumber",
  "publicationDate",
  "noticeType",
  "matched",
  "reasons",
  "title",
  "url",
];

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join(" ") : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function main() {
  const root = process.cwd();
  const awardsFile = arg("--awards");
  if (!awardsFile) {
    console.error(
      "usage: match-ted-lots.ts --awards data/ted/ro.json [--country ro] [--min low|medium|high] [--max-per-notice 3] [--format csv|table]",
    );
    process.exit(2);
  }
  if (!fs.existsSync(awardsFile)) {
    console.error(
      `${awardsFile} does not exist. Harvest first:\n  npx tsx scripts/fetch-ted-contracts.ts --country RO --out ${awardsFile} --from 2024`,
    );
    process.exit(2);
  }

  const harvest = JSON.parse(fs.readFileSync(awardsFile, "utf8")) as {
    country?: string;
    awards?: TedNotice[];
  };
  const notices = harvest.awards ?? [];
  const country =
    (arg("--country") ?? harvest.country ?? "").toLowerCase() || undefined;
  const projects = loadProjects(root, country);

  const rows = matchNotices(notices, projects, {
    maxPerNotice: Number(arg("--max-per-notice", "3")),
    minConfidence:
      (arg("--min", "low") as Exclude<MatchConfidence, "none">) ?? "low",
  });

  if (arg("--format", "csv") === "table") {
    const counts: Record<string, number> = {};
    for (const row of rows)
      counts[row.confidence] = (counts[row.confidence] ?? 0) + 1;
    for (const row of rows) {
      console.log(
        `${row.confidence.padEnd(6)} ${String(row.score).padEnd(6)} ${`${row.project}/${row.lot}`.padEnd(44)} ${row.publicationNumber.padEnd(12)} ${row.wouldAdd.join(" ") || "(nothing new)"}`,
      );
      console.log(`       ${row.title.slice(0, 150)}`);
    }
    console.log(
      `\n${notices.length} notice(s) against ${projects.reduce((n, p) => n + p.lots.length, 0)} lot(s) in ${projects.length} project(s)`,
    );
    console.log(
      `${rows.length} candidate row(s): ${["high", "medium", "low"].map((c) => `${counts[c] ?? 0} ${c}`).join(", ")}`,
    );
    console.log(
      `${new Set(rows.map((r) => r.publicationNumber)).size} of ${notices.length} notices matched something.`,
    );
    console.log(
      "Every row needs a human. Nothing here is written to data/projects.",
    );
    return;
  }

  const lines = [COLUMNS.join(",")];
  for (const row of rows)
    lines.push(COLUMNS.map((c) => csvCell(row[c])).join(","));
  process.stdout.write(`${lines.join("\n")}\n`);
}

if (process.argv[1] && process.argv[1].endsWith("match-ted-lots.ts")) {
  process.stdout.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code !== "EPIPE") throw e;
  });
  main();
}
