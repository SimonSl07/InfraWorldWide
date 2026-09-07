/**
 * Pulls the infrastructure news feeds and the edit history of every Wikipedia
 * article the projects cite, and writes a digest for a person to read:
 *
 *   npx tsx scripts/fetch-news.ts                                    # to stdout
 *   npx tsx scripts/fetch-news.ts --state .news/seen.json --out reports/news.md
 *   npx tsx scripts/fetch-news.ts --window 14 --retain 90
 *
 * The state file remembers which URLs a run has seen, so a feed's archive is
 * not reported as news every day; it is a record of what the feeds carried,
 * not site data, and lives in .news/ rather than under data/. The workflow
 * keeps it in the Actions cache. The digest is a rolling window,
 * so a reader who opens the issue once a week sees the week.
 *
 * Report, not a writer. Every line names the section it probably concerns
 * and the event the wording suggests; recording either is a person's job,
 * with the article read and cited. A source that cannot be fetched is a line
 * in the digest, never a failed run: this exits 0 unless its own inputs are
 * broken.
 */
import fs from "node:fs";
import path from "node:path";
import { projectSchema, type Project } from "../src/lib/schema";
import { tokenWeights } from "../src/lib/ted-match";
import {
  EMPTY_STATE,
  formatDigest,
  isRelevant,
  matchItem,
  mergeState,
  newsSourcesSchema,
  parseFeed,
  searchText,
  suggestEventKind,
  wikipediaWatches,
  windowItems,
  type DigestEntry,
  type FeedItem,
  type NewsState,
} from "../src/lib/news";

const USER_AGENT =
  "InfraWorldWide-news-digest/0.1 (+https://github.com/SimonSl07/InfraWorldWide)";
const FETCH_TIMEOUT_MS = 20_000;

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".json")) yield full;
  }
}

function loadProjects(root: string): Project[] {
  const projects: Project[] = [];
  for (const file of walk(path.join(root, "data/projects"))) {
    const parsed = projectSchema.safeParse(
      JSON.parse(fs.readFileSync(file, "utf8")),
    );
    if (parsed.success) projects.push(parsed.data);
  }
  return projects.sort((a, b) => a.id.localeCompare(b.id));
}

function loadState(file: string): NewsState {
  if (!fs.existsSync(file)) return EMPTY_STATE;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as NewsState;
    return parsed.version === 1 && parsed.items ? parsed : EMPTY_STATE;
  } catch {
    // A corrupt state file means one run reports the feeds' archives again,
    // which is recoverable; refusing to run is not.
    return EMPTY_STATE;
  }
}

async function fetchFeed(url: string): Promise<FeedItem[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      // Explicitly what `fetch` would send anyway, because the polite
      // version cost real sources: clubferoviar.ro and proinfrastructura.ro
      // answer 415 to any Accept that names a media type, including
      // `application/rss+xml, */*`. `parseFeed` sniffs the body to decide
      // what arrived, so naming types bought nothing.
      Accept: "*/*",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = parseFeed(await res.text());
  // The content type goes in the message because the usual cause is a host
  // answering 200 with an HTML challenge page rather than the feed, and
  // "no items parsed" alone does not say which of those happened.
  if (items.length === 0) {
    const type = res.headers.get("content-type")?.split(";")[0] ?? "no type";
    throw new Error(`no items parsed (${type})`);
  }
  return items;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const today = new Date().toISOString().slice(0, 10);
  const stateFile = arg("--state", path.join(root, ".news/seen.json"));
  const outFile = arg("--out", "");
  const windowDays = Number(arg("--window", "14"));
  const retainDays = Number(arg("--retain", "90"));

  const projects = loadProjects(root);
  const weights = tokenWeights(projects);
  const catalogue = newsSourcesSchema.parse(
    JSON.parse(
      fs.readFileSync(path.join(root, "data/news-sources.json"), "utf8"),
    ),
  );
  const watches = wikipediaWatches(projects);

  /** Where an item came from: its display name and how to judge relevance. */
  const origins = new Map<
    string,
    {
      name: string;
      focus: "infrastructure" | "general";
      country?: string;
      wikipediaProject?: string;
    }
  >();
  const feeds: Array<{ sourceId: string; url: string }> = [];
  for (const source of catalogue.sources) {
    origins.set(source.id, {
      name: source.name,
      focus: source.focus,
      country: source.country,
    });
    feeds.push({ sourceId: source.id, url: source.url });
  }
  for (const watch of watches) {
    const sourceId = `wikipedia:${watch.projectId}:${watch.edition}`;
    origins.set(sourceId, {
      name: `${watch.edition}.wikipedia.org`,
      focus: "infrastructure",
      wikipediaProject: watch.projectId,
    });
    feeds.push({ sourceId, url: watch.feedUrl });
  }

  const fetched: Array<{ sourceId: string; item: FeedItem }> = [];
  const failures: Array<{ source: string; error: string }> = [];
  // Sequential on purpose: eight news sites and some sixty Wikipedia
  // histories, and Wikipedia asks clients not to hammer it.
  for (const feed of feeds) {
    try {
      for (const item of await fetchFeed(feed.url)) {
        fetched.push({ sourceId: feed.sourceId, item });
      }
    } catch (e) {
      failures.push({
        source: origins.get(feed.sourceId)?.name ?? feed.sourceId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const state = mergeState(loadState(stateFile), fetched, today, retainDays);
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);

  const entries: DigestEntry[] = [];
  for (const item of windowItems(state, today, windowDays)) {
    const origin = origins.get(item.sourceId);
    // A source that left the catalogue keeps its items in the state until
    // they age out, but has nothing to say about how to read them.
    if (!origin) continue;
    if (origin.wikipediaProject) {
      entries.push({
        item,
        sourceName: origin.name,
        wikipediaProject: origin.wikipediaProject,
        candidates: [],
        suggested: null,
      });
      continue;
    }
    if (!isRelevant(item, origin.focus, origin.country)) continue;
    const candidates = matchItem(item, projects, weights, {
      country: origin.country,
    });
    entries.push({
      item,
      sourceName: origin.name,
      candidates,
      suggested: suggestEventKind(searchText(item, origin.country)),
    });
  }

  const digest = formatDigest({
    entries,
    failures,
    sources: feeds.length,
    windowDays,
  });

  if (outFile) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, digest);
    console.log(
      `✓ ${entries.length} entr${entries.length === 1 ? "y" : "ies"} in the last ${windowDays} days from ${feeds.length} feeds (${failures.length} failed); digest in ${path.relative(root, outFile)}`,
    );
  } else {
    process.stdout.write(digest);
  }
}

if (process.argv[1] && process.argv[1].endsWith("fetch-news.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
