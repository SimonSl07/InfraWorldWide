import { z } from "zod";
import type { LotEvent, Project } from "./schema";
import {
  normaliseText,
  routeRefs,
  scoreNotice,
  serbianLatin,
  type MatchConfidence,
} from "./ted-match";

/**
 * The daily news digest: what the infrastructure press and the Wikipedia
 * articles the projects cite said recently, matched to the lots in
 * data/projects.
 *
 * A report, like every other harvester here. `match-ted-lots.ts` stops one
 * move short of writing because a wrong match puts a cited figure on the
 * wrong road and nothing downstream notices; a news article is a noisier
 * input than a TED notice, so this stops at the same line. Each entry says
 * which section it probably concerns and what kind of event the wording
 * suggests, and a person takes it from there.
 *
 * Everything in this module is pure: the fetching, the state file and the
 * issue live in scripts/fetch-news.ts and the workflow.
 */

/* ── Sources ──────────────────────────────────────────────────────────── */

export const newsSourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  /** RSS 2.0 or Atom. */
  url: z.url(),
  /** ISO 3166-1 alpha-2, lowercase, or "eu". */
  country: z.string().min(2).max(2),
  language: z.string().min(2).max(5),
  /**
   * A trade feed is about infrastructure by definition and every item is
   * kept. A general news feed is filtered: an item stays only when it names
   * a section or reads as infrastructure news.
   */
  focus: z.enum(["infrastructure", "general"]),
  note: z.string().min(1).optional(),
});
export type NewsSource = z.infer<typeof newsSourceSchema>;

export const newsSourcesSchema = z.object({
  note: z.string().min(1),
  sources: z.array(newsSourceSchema).min(1),
});
export type NewsSources = z.infer<typeof newsSourcesSchema>;

/* ── Feeds ────────────────────────────────────────────────────────────── */

export interface FeedItem {
  url: string;
  title: string;
  /** YYYY-MM-DD, or null when the feed gave no parseable date. */
  published: string | null;
  /** Plain text: tags stripped, entities decoded, whitespace collapsed. */
  summary: string;
}

function unwrapCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/** Numeric first, `&amp;` last, so "&amp;#8230;" is not decoded twice. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * The readable text of a feed field. Feeds wrap HTML in CDATA or escape it
 * (Atom's `type="html"`), and the text inside that HTML carries its own
 * entities, so decoding runs before and after the tags are stripped.
 */
export function feedText(raw: string | null): string {
  if (raw === null) return "";
  return decodeEntities(
    decodeEntities(unwrapCdata(raw)).replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Content of the first `<name>` element in a block, or null. */
function element(block: string, name: string): string | null {
  const match = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,
    "i",
  ).exec(block);
  return match ? match[1] : null;
}

/**
 * An entry's link. RSS puts the URL in the element's text; Atom puts it in
 * an `href`, and an entry may carry several links, of which the alternate
 * (or the one with no `rel` at all) is the page.
 */
function entryLink(block: string): string | null {
  const text = element(block, "link");
  if (text !== null && text.trim().length > 0 && !text.includes("<")) {
    return decodeEntities(unwrapCdata(text).trim());
  }
  let fallback: string | null = null;
  for (const match of block.matchAll(/<link\b([^>]*)\/?>/gi)) {
    const attrs = match[1];
    const href = /href="([^"]+)"/.exec(attrs)?.[1];
    if (!href) continue;
    const rel = /rel="([^"]+)"/.exec(attrs)?.[1];
    if (rel === undefined || rel === "alternate") return decodeEntities(href);
    fallback ??= decodeEntities(href);
  }
  return fallback;
}

/** YYYY-MM-DD for anything `Date` can parse (RFC 822 and ISO both appear). */
export function feedDate(raw: string | null): string | null {
  if (raw === null) return null;
  const parsed = new Date(feedText(raw));
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
}

/**
 * Items of an RSS 2.0 or Atom document. Hand-rolled rather than a dependency:
 * the two shapes are small, and a parser that tolerates the mixed CDATA and
 * namespaced fields real feeds carry is the whole requirement.
 */
export function parseFeed(xml: string): FeedItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  const items: FeedItem[] = [];
  for (const [, , block] of blocks) {
    const url = entryLink(block);
    const title = feedText(element(block, "title"));
    if (!url || title.length === 0) continue;
    const summary = feedText(
      element(block, "content:encoded") ??
        element(block, "description") ??
        element(block, "summary") ??
        element(block, "content"),
    );
    items.push({
      url,
      title,
      published: feedDate(
        element(block, "pubDate") ??
          element(block, "published") ??
          element(block, "updated") ??
          element(block, "dc:date"),
      ),
      summary,
    });
  }
  return items;
}

/* ── Wikipedia ────────────────────────────────────────────────────────── */

export interface WikipediaWatch {
  projectId: string;
  /** Article title as it appears in the URL, still percent-encoded. */
  title: string;
  /** "ro", "en", "bg": the language edition. */
  edition: string;
  /** The article's edit history as Atom. */
  feedUrl: string;
}

const WIKIPEDIA_ARTICLE =
  /^https:\/\/([a-z]{2})\.wikipedia\.org\/wiki\/([^#?]+)/;

/**
 * Every Wikipedia article a project cites, as a history feed to watch.
 *
 * The README records that the Romanian articles are the richest source this
 * dataset has for per-lot contractors and dates, and 44 of 52 projects cite
 * one. An edit to a cited article is the cheapest signal that a fact behind
 * a figure may have moved, and it covers the two countries no press feed
 * reaches.
 */
export function wikipediaWatches(projects: Project[]): WikipediaWatch[] {
  const seen = new Set<string>();
  const watches: WikipediaWatch[] = [];
  for (const project of projects) {
    for (const source of project.sources) {
      const match = WIKIPEDIA_ARTICLE.exec(source.url);
      if (!match) continue;
      const [, edition, title] = match;
      const key = `${project.id}:${edition}:${title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      watches.push({
        projectId: project.id,
        title,
        edition,
        feedUrl: `https://${edition}.wikipedia.org/w/index.php?title=${title}&action=history&feed=atom`,
      });
    }
  }
  return watches;
}

/** "~2026-48233-24: /* Listă ieșiri *​/" becomes "Listă ieșiri". */
export function editSummary(title: string): string {
  const colon = title.indexOf(": ");
  const summary = colon === -1 ? title : title.slice(colon + 2);
  return summary
    .replace(/\/\*\s*([^*]*?)\s*\*\//g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── Relevance ────────────────────────────────────────────────────────── */

/**
 * Words that make a general-news item infrastructure news. Matched as whole
 * tokens of `normaliseText`, which lowercases, strips diacritics and
 * transliterates Cyrillic, so one list covers Romanian, English, Bulgarian
 * and Serbian spellings.
 */
const INFRA_TOKENS = new Set([
  // ro
  "autostrada",
  "autostrazi",
  "autostrazii",
  "expres",
  "cnair",
  "cnadnr",
  "cfr",
  "ferata",
  "ferate",
  "metrou",
  "metroul",
  "metrorex",
  "tunel",
  "tunelul",
  "tuneluri",
  "pod",
  "podul",
  "poduri",
  "viaduct",
  "viaductul",
  "pasaj",
  "pasajul",
  "centura",
  "centurii",
  "ocolitoare",
  "tronson",
  "tronsonul",
  "lot",
  "lotul",
  "loturi",
  // en
  "motorway",
  "highway",
  "expressway",
  "railway",
  "rail",
  "metro",
  "bridge",
  "tunnel",
  "viaduct",
  // bg, transliterated
  "avtomagistrala",
  "avtomagistralata",
  "magistrala",
  "magistralata",
  "zhelezopatna",
  "metroto",
  "most",
  "mostat",
  // sr, latin and transliterated
  "autoput",
  "autoputa",
  "koridor",
  "pruga",
  "pruge",
]);

export function hasInfrastructureKeyword(text: string): boolean {
  return normaliseText(text)
    .split(" ")
    .some((token) => INFRA_TOKENS.has(token));
}

/* ── Matching ─────────────────────────────────────────────────────────── */

export interface LotCandidate {
  projectId: string;
  /** Null for a match on the route alone, with no section named. */
  lotId: string | null;
  confidence: MatchConfidence;
  score: number;
  /** Place names or route references the item shares with the section. */
  matched: string[];
}

const RANK: Record<MatchConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

/**
 * The sections an item probably concerns, best first.
 *
 * Scored with the TED matcher's place-name weighting, through a synthetic
 * notice with no date and no CPV label: a news item has neither, and the
 * date bonus would otherwise penalise every report about a road awarded
 * years ago. An item that names a route (A7, DEx12) but no section is kept
 * as a project-level candidate, so the digest can still file it under the
 * right road; with `country` set, only that country's roads qualify, since
 * "A1" names a motorway in each of the three and a Romanian paper means the
 * Romanian one.
 */
export function matchItem(
  item: FeedItem,
  projects: Project[],
  weights: Map<string, number>,
  options: { limit?: number; country?: string } = {},
): LotCandidate[] {
  const { limit = 3, country } = options;
  // The Serbian Latin form rides along with the original. Serbian sections
  // are recorded in Latin ("Kruševac East") and the four Serbian official
  // feeds publish in Cyrillic, so without this they match nothing at all.
  // `serbianLatin` returns "" for text holding no Cyrillic, which is every
  // Romanian and English item, so nothing else changes.
  const raw = `${item.title} ${item.summary}`;
  const text = `${raw} ${serbianLatin(raw)}`.trimEnd();
  const notice = {
    publicationNumber: item.url,
    publicationDate: "",
    title: text,
    value: null,
    durationValue: null,
  };
  const itemRefs = routeRefs(text);
  const candidates: LotCandidate[] = [];

  for (const project of projects) {
    let lotMatched = false;
    for (const lot of project.lots) {
      const result = scoreNotice(notice, lot, project, weights);
      if (result.confidence === "none") continue;
      lotMatched = true;
      candidates.push({
        projectId: project.id,
        lotId: lot.id,
        confidence: result.confidence,
        score: result.score,
        matched: result.matched,
      });
    }
    if (lotMatched || (country !== undefined && project.country !== country)) {
      continue;
    }
    const projectRefs = new Set([
      ...routeRefs(project.id.slice(3).replace(/-/g, " ")),
      ...routeRefs(project.name.en),
    ]);
    const shared = itemRefs.filter((ref) => projectRefs.has(ref));
    if (shared.length > 0) {
      candidates.push({
        projectId: project.id,
        lotId: null,
        confidence: "low",
        score: 0.25,
        matched: shared,
      });
    }
  }

  return candidates
    .sort(
      (a, b) =>
        RANK[b.confidence] - RANK[a.confidence] ||
        b.score - a.score ||
        a.projectId.localeCompare(b.projectId),
    )
    .slice(0, limit);
}

/**
 * Whether a general-news item earns a place in the digest at all.
 *
 * The vocabulary is required, not just a match: a corridor's towns are also
 * where shops open and police chases end, and the first live run filed a
 * Leroy Merlin opening in Brăila under the A7 on the strength of the place
 * names alone. A trade feed is about infrastructure by definition.
 */
export function isRelevant(
  item: FeedItem,
  focus: NewsSource["focus"],
): boolean {
  if (focus === "infrastructure") return true;
  return hasInfrastructureKeyword(`${item.title} ${item.summary}`);
}

/* ── Event kind ───────────────────────────────────────────────────────── */

/**
 * Phrases, in `normaliseText` form, that suggest which `lotEventSchema`
 * kind a report describes. First match wins, and the order puts the
 * decisive words (an opening, a termination) before the routine ones. A
 * suggestion only: the digest prints it beside the item and a person
 * decides whether the article really says so.
 */
const EVENT_PHRASES: Array<[LotEvent["kind"], string[]]> = [
  [
    "contract_terminated",
    ["reziliat", "rezilierea", "rezilieze", "contract terminated", "prekinut"],
  ],
  ["suspended", ["suspendat", "suspendate", "sistat", "sistate", "suspended"]],
  [
    "partial_opening",
    ["deschis partial", "deschisa partial", "primul tronson deschis"],
  ],
  [
    "opened",
    [
      "inaugurat",
      "inaugurata",
      "inaugurarea",
      "deschis circulatiei",
      "deschisa circulatiei",
      "deschis traficului",
      "deschisa traficului",
      "dat in trafic",
      "data in trafic",
      "dat in folosinta",
      "data in folosinta",
      "se deschide circulatia",
      "s a deschis circulatia",
      "opened to traffic",
      "inaugurated",
      "otvoren za saobracaj",
      "pusnat v eksploatatsiya",
    ],
  ],
  [
    "construction_start",
    [
      "ordin de incepere",
      "ordinul de incepere",
      "au inceput lucrarile",
      "incep lucrarile",
      "inceperea lucrarilor",
      "a inceput constructia",
      "construction started",
      "construction begins",
      "works began",
      "prva kopka",
      "parva kopka",
    ],
  ],
  [
    "awarded",
    [
      "contract semnat",
      "contractul semnat",
      "a semnat contractul",
      "semnarea contractului",
      "a fost atribuit",
      "a atribuit contractul",
      "desemnat castigator",
      "desemnata castigatoare",
      "castigatorul licitatiei",
      "a castigat licitatia",
      "contract awarded",
      "signed the contract",
      "potpisan ugovor",
    ],
  ],
  [
    "tender_launched",
    [
      "a lansat licitatia",
      "licitatie lansata",
      "a scos la licitatie",
      "anunt de participare",
      "tender launched",
      "raspisan tender",
    ],
  ],
  [
    "tender_cancelled",
    ["licitatie anulata", "a anulat licitatia", "tender cancelled"],
  ],
];

export function suggestEventKind(text: string): LotEvent["kind"] | null {
  const haystack = ` ${normaliseText(text)} `;
  for (const [kind, phrases] of EVENT_PHRASES) {
    if (phrases.some((phrase) => haystack.includes(` ${phrase} `))) {
      return kind;
    }
  }
  return null;
}

/* ── State ────────────────────────────────────────────────────────────── */

export interface StoredItem extends FeedItem {
  /** Id of the news source, or "wikipedia:<projectId>". */
  sourceId: string;
  /** YYYY-MM-DD the run first saw the URL. */
  firstSeen: string;
}

export interface NewsState {
  version: 1;
  items: Record<string, StoredItem>;
}

export const EMPTY_STATE: NewsState = { version: 1, items: {} };

/** Days back from `today`, as YYYY-MM-DD. */
export function daysBefore(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Summaries are stored for matching, not reading; this is plenty. */
const SUMMARY_LIMIT = 600;

/**
 * Folds a run's items into the state: new URLs are stamped with today, known
 * ones keep their first sighting, and anything first seen longer ago than
 * `retainDays` is dropped so the file does not grow without bound. Pure, so
 * the pruning and the stamping are testable without a clock.
 */
export function mergeState(
  state: NewsState,
  fetched: Array<{ sourceId: string; item: FeedItem }>,
  today: string,
  retainDays: number,
): NewsState {
  const cutoff = daysBefore(today, retainDays);
  const items: Record<string, StoredItem> = {};
  for (const [url, stored] of Object.entries(state.items)) {
    if (stored.firstSeen >= cutoff) items[url] = stored;
  }
  for (const { sourceId, item } of fetched) {
    const known = items[item.url];
    items[item.url] = {
      ...item,
      summary: item.summary.slice(0, SUMMARY_LIMIT),
      sourceId,
      firstSeen: known?.firstSeen ?? today,
    };
  }
  return { version: 1, items };
}

/**
 * The items the digest shows: published inside the window, or first seen
 * inside it when the feed gave no date. A rolling window rather than "new
 * since yesterday", so a reader who opens the issue once a week sees the
 * week, and the first run does not dump a feed's whole archive.
 */
export function windowItems(
  state: NewsState,
  today: string,
  windowDays: number,
): StoredItem[] {
  const cutoff = daysBefore(today, windowDays);
  return Object.values(state.items)
    .filter((item) => (item.published ?? item.firstSeen) >= cutoff)
    .sort(
      (a, b) =>
        (b.published ?? b.firstSeen).localeCompare(
          a.published ?? a.firstSeen,
        ) || a.url.localeCompare(b.url),
    );
}

/* ── Digest ───────────────────────────────────────────────────────────── */

export interface DigestEntry {
  item: StoredItem;
  /** Display name of the feed. */
  sourceName: string;
  /** Set for a Wikipedia history feed: the project whose article changed. */
  wikipediaProject?: string;
  candidates: LotCandidate[];
  suggested: LotEvent["kind"] | null;
}

export interface DigestInput {
  entries: DigestEntry[];
  failures: Array<{ source: string; error: string }>;
  /** Feeds attempted, news and Wikipedia together. */
  sources: number;
  windowDays: number;
  /** Entries beyond this go under a count rather than a line each. */
  maxEntries?: number;
}

function line(entry: DigestEntry): string {
  const { item, sourceName, candidates, suggested } = entry;
  const date = item.published ?? item.firstSeen;
  const parts = [`${date} · ${sourceName} · [${item.title}](${item.url})`];
  const best = candidates[0];
  if (best) {
    const target = best.lotId
      ? `${best.projectId} / ${best.lotId}`
      : best.projectId;
    parts.push(`→ ${target} (${best.confidence})`);
    if (candidates.length > 1) {
      const others = candidates
        .slice(1)
        .map((c) => (c.lotId ? `${c.projectId} / ${c.lotId}` : c.projectId));
      parts.push(`or ${others.join(", ")}`);
    }
  }
  if (suggested) parts.push(`· suggests \`${suggested}\``);
  return `- ${parts.join(" ")}`;
}

function grouped(
  entries: DigestEntry[],
  keyOf: (entry: DigestEntry) => string,
): Array<[string, DigestEntry[]]> {
  const groups = new Map<string, DigestEntry[]>();
  for (const entry of entries) {
    const key = keyOf(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * The digest as Markdown for one GitHub issue.
 *
 * Deliberately free of the run date: the workflow fingerprints the body and
 * edits the issue only when it changed, so a quiet day must produce the same
 * bytes as the day before. What varies is the entries themselves.
 */
export function formatDigest(input: DigestInput): string {
  const { entries, failures, sources, windowDays, maxEntries = 200 } = input;
  const shown = entries.slice(0, maxEntries);
  const hidden = entries.length - shown.length;

  const sections: string[] = [];
  const best = (e: DigestEntry) => e.candidates[0];
  /**
   * A section is named at the top of the digest only when the match is worth
   * a person's attention. A low-confidence lot match is one shared place
   * name, and a live run put an explosion in Augsburg under the Sofia metro
   * and a locomotive fire under a Danube bridge. Those belong in the fold
   * with the rest of the day's reading, not in the list a reader is meant to
   * act on. Medium and high are what a toponym match earns when it is the
   * road the article is actually about.
   */
  const headlined = (e: DigestEntry) => {
    const top = best(e);
    return (
      top?.lotId != null &&
      (top.confidence === "high" || top.confidence === "medium")
    );
  };

  const wikipedia = shown.filter((e) => e.wikipediaProject !== undefined);
  const news = shown.filter((e) => e.wikipediaProject === undefined);
  const matched = news.filter(headlined);
  const routeOnly = news.filter(
    (e) => !headlined(e) && best(e)?.lotId == null && e.candidates.length > 0,
  );
  const unmatched = news.filter(
    (e) =>
      !headlined(e) && (e.candidates.length === 0 || best(e)?.lotId != null),
  );

  sections.push(
    `Infrastructure news from the last ${windowDays} days, matched to the sections in \`data/projects\`. A report for a person: nothing here is written to the data. Each match is a guess from shared place names; read the article before recording anything, and cite it with the date you read it.`,
  );

  if (matched.length > 0) {
    const lines = ["## Matched to a section", ""];
    for (const [projectId, group] of grouped(
      matched,
      (e) => e.candidates[0].projectId,
    )) {
      lines.push(`### ${projectId}`, "", ...group.map(line), "");
    }
    sections.push(lines.join("\n").trimEnd());
  }

  if (routeOnly.length > 0) {
    sections.push(
      ["## Route named, no section matched", "", ...routeOnly.map(line)].join(
        "\n",
      ),
    );
  }

  if (wikipedia.length > 0) {
    const lines = ["## Cited Wikipedia articles edited", ""];
    for (const [projectId, group] of grouped(
      wikipedia,
      (e) => e.wikipediaProject ?? "",
    )) {
      lines.push(`### ${projectId}`, "");
      for (const entry of group) {
        const date = entry.item.published ?? entry.item.firstSeen;
        const summary = editSummary(entry.item.title) || "(no edit summary)";
        lines.push(`- ${date} · [${summary}](${entry.item.url})`);
      }
      lines.push("");
    }
    sections.push(lines.join("\n").trimEnd());
  }

  if (unmatched.length > 0) {
    sections.push(
      [
        "<details>",
        `<summary>Other infrastructure news, no section matched (${unmatched.length})</summary>`,
        "",
        ...unmatched.map(line),
        "",
        "</details>",
      ].join("\n"),
    );
  }

  if (
    matched.length + routeOnly.length + wikipedia.length + unmatched.length ===
    0
  ) {
    sections.push("Nothing new in the window.");
  }

  if (hidden > 0) {
    sections.push(`${hidden} more entries not listed.`);
  }

  if (failures.length > 0) {
    sections.push(
      [
        "## Sources that failed this run",
        "",
        ...failures.map((f) => `- ${f.source}: ${f.error}`),
      ].join("\n"),
    );
  }

  sections.push(
    `${sources} feeds. Regenerate locally with \`npm run data:news\`.`,
  );

  return `${sections.join("\n\n")}\n`;
}
