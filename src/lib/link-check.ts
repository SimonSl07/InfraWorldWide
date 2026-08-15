import type { Project } from "./schema";

/**
 * Checking that the cited sources still resolve.
 *
 * Every fact in data/projects carries a source URL, so a source that has gone
 * away quietly turns a cited figure into an unverifiable one. One of the 184
 * committed URLs is already dead. The fetching lives in scripts/check-links.ts;
 * what is here is the part worth testing: which URLs exist, and what an HTTP
 * status means.
 */

export interface SourceLink {
  url: string;
  /** Project ids citing it, sorted. */
  usedBy: string[];
}

/** Every distinct URL cited anywhere in the project data, sorted by URL. */
export function collectSourceUrls(projects: Project[]): SourceLink[] {
  const byUrl = new Map<string, Set<string>>();

  const add = (url: string, projectId: string) => {
    const users = byUrl.get(url) ?? new Set<string>();
    users.add(projectId);
    byUrl.set(url, users);
  };

  for (const project of projects) {
    for (const source of project.sources) add(source.url, project.id);
    for (const lot of project.lots) {
      if (lot.contract?.noticeUrl) add(lot.contract.noticeUrl, project.id);
    }
  }

  return [...byUrl.entries()]
    .map(([url, users]) => ({ url, usedBy: [...users].sort() }))
    .sort((a, b) => a.url.localeCompare(b.url));
}

/**
 * What a response says about the source.
 *
 * "blocked" is its own verdict because two of the sources this project already
 * documents refuse automated requests outright: reporting them as dead every
 * week would train the reader to ignore the report, and deleting the citation
 * would be wrong since a human can still open the page.
 */
export type LinkVerdict = "ok" | "dead" | "blocked" | "unknown";

export function classifyLink(response: { status: number | null; error?: string }): LinkVerdict {
  const status = response.status;
  if (status === null) return "unknown";
  if (status >= 200 && status < 400) return "ok";
  if (status === 404 || status === 410) return "dead";
  if (status === 401 || status === 403 || status === 429) return "blocked";
  return "unknown";
}

export interface LinkResult extends SourceLink {
  status: number | null;
  error?: string;
  verdict: LinkVerdict;
}

const ORDER: LinkVerdict[] = ["dead", "blocked", "unknown"];

/** The links that need a human, worst first. Working links are not listed. */
export function formatLinkReport(results: LinkResult[]): string {
  const lines: string[] = [];

  for (const verdict of ORDER) {
    const rows = results.filter((r) => r.verdict === verdict);
    if (rows.length === 0) continue;
    lines.push(`${verdict.toUpperCase()} (${rows.length})`);
    for (const row of rows) {
      const reason = row.status !== null ? String(row.status) : (row.error ?? "no response");
      lines.push(`  ${reason}  ${row.url}`);
      lines.push(`        cited by ${row.usedBy.join(", ")}`);
    }
    lines.push("");
  }

  const count = (verdict: LinkVerdict) => results.filter((r) => r.verdict === verdict).length;
  lines.push(
    `${count("dead")} dead, ${count("blocked")} blocked, ${count("unknown")} unknown, ${count("ok")} ok, ${results.length} checked`,
  );
  return lines.join("\n");
}
