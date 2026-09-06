/**
 * Checks that every URL cited in data/projects still resolves:
 *
 *   npx tsx scripts/check-links.ts                 # all of them
 *   npx tsx scripts/check-links.ts --country ro
 *   npx tsx scripts/check-links.ts --fail-on-dead  # exit 1 if any 404
 *
 * Facts here are only as good as their citations, and one of the committed
 * URLs is already dead. Deliberately not part of `npm test`: 184 requests over
 * the public internet is neither fast nor reliable enough to gate a commit.
 * It runs weekly in .github/workflows/scheduled-checks.yml instead.
 *
 * A 403 is reported as "blocked", not as dead. Two of the sources this project
 * documents refuse automated requests, and a human opening the page still
 * gets it.
 */
import fs from "node:fs";
import path from "node:path";
import { projectSchema, type Project } from "../src/lib/schema";
import {
  classifyLink,
  collectSourceUrls,
  formatLinkReport,
  type LinkResult,
} from "../src/lib/link-check";

const CONCURRENCY = 6;
const TIMEOUT_MS = 20000;
const USER_AGENT =
  "InfraWorldWide-link-check/0.1 (+https://github.com/, weekly source verification)";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
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
  return projects;
}

/**
 * HEAD first, since most of these are large pages and the status is all that
 * is wanted. Plenty of servers answer HEAD with 405 or 403 while serving GET
 * fine, so anything that is not a clean answer is retried as a GET.
 */
async function probe(
  url: string,
): Promise<{ status: number | null; error?: string }> {
  for (const method of ["HEAD", "GET"] as const) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      });
      if (
        method === "HEAD" &&
        (res.status === 405 || res.status === 403 || res.status >= 500)
      ) {
        continue;
      }
      return { status: res.status };
    } catch (e) {
      if (method === "GET") {
        return {
          status: null,
          error:
            (e as Error).name === "AbortError"
              ? "timeout"
              : (e as Error).message,
        };
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return { status: null, error: "no response" };
}

async function main() {
  const root = process.cwd();
  const country = arg("--country");
  const links = collectSourceUrls(loadProjects(root, country));
  console.log(`Checking ${links.length} cited URL(s).`);

  const results: LinkResult[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, links.length) }, async () => {
      while (next < links.length) {
        const link = links[next++];
        const response = await probe(link.url);
        results.push({ ...link, ...response, verdict: classifyLink(response) });
      }
    }),
  );

  results.sort((a, b) => a.url.localeCompare(b.url));
  console.log(`\n${formatLinkReport(results)}`);

  if (
    process.argv.includes("--fail-on-dead") &&
    results.some((r) => r.verdict === "dead")
  ) {
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("check-links.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
