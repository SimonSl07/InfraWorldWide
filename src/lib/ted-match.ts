import { contractMonths } from "./contract";
import type { Lot, Project } from "./schema";

/**
 * Matching TED award notices to lots.
 *
 * scripts/fetch-ted-contracts.ts harvests notices and its own header calls
 * matching "a separate, reviewable step". That step did not exist, so the
 * harvest fed nothing. This is it, and it deliberately stops one move short of
 * writing: it emits candidates with a confidence and a reason, for a human to
 * accept. A notice titled "Road construction works" may be a motorway section
 * or a village resurfacing, and no score can tell them apart reliably enough
 * to edit cited data unattended.
 *
 * What makes the match possible is that notice titles carry the same
 * toponyms as the lot names: "AUTOSTRADA PLOIESTI-BUZAU LOT 1 Dumbrava-Mizil"
 * against a lot named "Dumbrava (A3) – Mizil". So the signal is place-name
 * overlap, weighted by a route reference and by how close the notice sits to
 * the award date already recorded.
 */

export interface TedNotice {
  publicationNumber: string;
  publicationDate: string;
  noticeType?: string;
  conclusionDate?: string;
  title: string;
  lotTitles?: string;
  buyer?: string;
  winners?: string;
  /** Award value in WHOLE units of `currency`, as TED publishes it. */
  value: number | null;
  currency?: string;
  durationValue: number | null;
  durationUnit?: string;
  url?: string;
}

/**
 * Bulgarian Cyrillic to the romanisation the lot names already use
 * (Дупница = Dupnitsa). Streamlined BGN/PCGN, which is what Bulgarian road
 * signs and Wikipedia use, so it lands on the same spelling as the data.
 */
/**
 * Serbian Cyrillic to Serbian Latin, which is what the Serbian data is
 * written in.
 *
 * The map below it is Bulgarian: `ш` becomes `sh`, `ц` becomes `ts`, and `ј`
 * is not in it at all. Applied to Serbian that produces "po ate" for Појате
 * and "krushevats" for Крушевац, so an article from the Serbian ministry
 * could never match a lot called "Kruševac East". The two conventions
 * genuinely differ and one table cannot serve both, so this is a second one,
 * used only where the source is Serbian.
 *
 * Diacritics are emitted rather than folded away: `normaliseText` strips
 * them from both sides, and `đ` is a letter it does not decompose, so
 * emitting `đ` is what matches data that spells it that way.
 */
const SERBIAN_CYRILLIC: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  ђ: "đ",
  е: "e",
  ж: "ž",
  з: "z",
  и: "i",
  ј: "j",
  к: "k",
  л: "l",
  љ: "lj",
  м: "m",
  н: "n",
  њ: "nj",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  ћ: "ć",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "č",
  џ: "dž",
  ш: "š",
};

/**
 * The Serbian Latin form of a text, or "" when it holds no Cyrillic.
 *
 * Returning "" for Latin input is the point: the caller appends the result,
 * and appending nothing leaves every existing match exactly as it was.
 */
export function serbianLatin(text: string): string {
  let hasCyrillic = false;
  let out = "";
  for (const ch of text.toLowerCase()) {
    const mapped = SERBIAN_CYRILLIC[ch];
    if (mapped !== undefined) hasCyrillic = true;
    out += mapped ?? ch;
  }
  return hasCyrillic ? out : "";
}

const CYRILLIC: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sht",
  ъ: "a",
  ь: "y",
  ю: "yu",
  я: "ya",
};

/**
 * Lowercased, unaccented, punctuation-free text. Latin diacritics fold to
 * their base letter through Unicode decomposition; Cyrillic has no such
 * decomposition and is transliterated instead.
 */
export function normaliseText(text: string): string {
  const lower = text.toLowerCase();
  let out = "";
  for (const ch of lower) {
    out += CYRILLIC[ch] ?? ch;
  }
  return (
    out
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      // Romanian ș/ț often arrive as the Turkish-comma variants, which do not
      // decompose to s and t.
      .replace(/[şŝ]/g, "s")
      .replace(/[ţ]/g, "t")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  );
}

/**
 * Words that carry no location: procurement boilerplate, the generic half of
 * a place name ("de Jos"), and the words every notice title contains.
 */
const FILLER = new Set([
  "lot",
  "lotul",
  "loturi",
  "sectiunea",
  "sectiune",
  "sectiunile",
  "section",
  "sections",
  "sector",
  "sectorul",
  "tronson",
  "tronsonul",
  "etapa",
  "faza",
  "phase",
  "stage",
  "km",
  "de",
  "din",
  "la",
  "si",
  "and",
  "the",
  "a",
  "pe",
  "cu",
  "in",
  "incl",
  "inclusiv",
  "jos",
  "sus",
  "mare",
  "mic",
  "nord",
  "sud",
  "est",
  "vest",
  "north",
  "south",
  "east",
  "west",
  "bypass",
  "centura",
  "varianta",
  "ocolitoare",
  "junction",
  "nod",
  "nodul",
  "border",
  "frontiera",
  "autostrada",
  "autostrazii",
  "drum",
  "drumul",
  "expres",
  "highway",
  "road",
  "roads",
  "motorway",
  "railway",
  "rail",
  "cale",
  "ferata",
  "linia",
  "linie",
  "metrou",
  "metro",
  "pod",
  "podul",
  "bridge",
  "tunel",
  "tunelul",
  "tunnel",
  "construction",
  "works",
  "work",
  "lucrari",
  "executie",
  "proiectare",
  "romania",
  "bulgaria",
  "serbia",
  "for",
  "of",
  "to",
  "modernizarea",
  "reabilitare",
  "reabilitarea",
  "magistrala",
  "avtomagistrala",
  "uchastak",
  "obiectivul",
  "investitii",
  "obiectiv",
]);

/** Distinctive place-name tokens, in first-seen order, deduplicated. */
export function placeTokens(text: string): string[] {
  const seen = new Set<string>();
  for (const token of normaliseText(text).split(" ")) {
    if (token.length < 3) continue;
    if (FILLER.has(token)) continue;
    // Chainage ("0", "000", "21") and section codes ("1a") locate nothing.
    if (/^\d/.test(token)) continue;
    seen.add(token);
  }
  return [...seen];
}

/**
 * Route references in a text: A7, DEx12, DN2. Bulgarian sources write the
 * motorway as "A 3" with a space, so the space is optional here. Without that
 * the Bulgarian notices match no route at all.
 */
export function routeRefs(text: string): string[] {
  const normalised = normaliseText(text);
  const refs = new Set<string>();
  for (const match of normalised.matchAll(/\b(dex|dn|dj|a)\s?(\d{1,3})\b/g)) {
    refs.add(`${match[1]}${match[2]}`);
  }
  return [...refs];
}

/** Titles that are upkeep rather than construction, however they name a road. */
const MAINTENANCE = [
  "intretinere",
  "acord cadru",
  "acord-cadru",
  "reparatii",
  "estetica",
  "deszapezire",
  "marcaje",
  "mentenanta",
  "revizie",
  "maintenance",
  "framework",
  "snow",
  "curatenie",
  "semnalizare",
];

/**
 * What a notice is for, read from its CPV label.
 *
 * A TED title is "<country> – <CPV label> – <national title>", and the label
 * is the one part written in English on every notice whatever the language of
 * the tender. It is a much better discriminator than the free text: it is what
 * separates "Construction work for highways, roads" from "Road-repair works",
 * two titles that otherwise share every place name on a busy corridor.
 *
 * "structure" covers bridges, viaducts and tunnels, which sit on both road and
 * rail projects and so cannot rule either out.
 */
export type NoticeCategory =
  "road" | "rail" | "structure" | "maintenance" | "other";

export function noticeCategory(title: string): NoticeCategory {
  const segments = title.split(/\s+[–-]\s+/);
  if (segments.length < 2) return "other";
  const label = segments[1].toLowerCase();

  // Upkeep first: "Bridge renewal construction work" is renewal, not a bridge.
  if (/maintenance|repair|renewal|snow|cleaning|resurfacing/.test(label))
    return "maintenance";
  if (/bridge|viaduct|tunnel|overpass/.test(label)) return "structure";
  if (/rail|tram|metro|underground/.test(label)) return "rail";
  if (/highway|motorway|road|carriageway/.test(label)) return "road";
  return "other";
}

/** Which notice categories can belong to a project of this category. */
function categoryConflict(
  notice: NoticeCategory,
  project: Project["category"],
): string | null {
  const wantsRail = project === "railway";
  if (
    notice === "rail" &&
    !wantsRail &&
    project !== "tunnel" &&
    project !== "bridge"
  ) {
    return `railway notice against a ${project} project`;
  }
  if (notice === "road" && wantsRail) {
    return "road notice against a railway project";
  }
  return null;
}

export type MatchConfidence = "high" | "medium" | "low" | "none";

/**
 * How much each place name is worth, by how many lots use it.
 *
 * Lot names carry their corridor in brackets ("Poiana tunnel (A1
 * Pitesti-Sibiu lot 3)"), so the corridor endpoints appear on a dozen lots
 * while the tunnel's own name appears on one. Counting every name equally lets
 * any notice about the corridor outscore the notice actually about the lot.
 * A name used by n lots is worth 1/n.
 */
export function tokenWeights(projects: Project[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const project of projects) {
    for (const lot of project.lots) {
      for (const token of lotTokens(lot)) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }
  }
  const weights = new Map<string, number>();
  for (const [token, count] of counts) weights.set(token, 1 / count);
  return weights;
}

/**
 * A lot's place names. The id is a slug of the same toponyms and survives
 * renames, so it is read alongside the names rather than instead of them.
 */
function lotTokens(lot: Lot): string[] {
  return placeTokens(
    `${lot.id.replace(/-/g, " ")} ${lot.name.en} ${lot.name.ro ?? ""}`,
  );
}

export interface MatchScore {
  score: number;
  confidence: MatchConfidence;
  /** Lot place tokens the notice title also carries. */
  matched: string[];
  reasons: string[];
}

/** Year of a partial ISO date, or null. */
function year(date: string | undefined): number | null {
  if (!date) return null;
  const value = parseInt(date.slice(0, 4), 10);
  return Number.isInteger(value) ? value : null;
}

/**
 * How well one notice fits one lot, from 0 to about 1.3.
 *
 * The base is the share of the lot's place names the title repeats, which is
 * the only signal strong enough to stand alone. A shared route reference and a
 * plausible date are additive bonuses; a maintenance title is multiplied down
 * rather than dropped, because the occasional real award is worded that way.
 */
export function scoreNotice(
  notice: TedNotice,
  lot: Lot,
  project: Project,
  weights?: Map<string, number>,
): MatchScore {
  const category = noticeCategory(notice.title);
  const conflict = categoryConflict(category, project.category);
  if (conflict) {
    return { score: 0, confidence: "none", matched: [], reasons: [conflict] };
  }

  const haystack = normaliseText(`${notice.title} ${notice.lotTitles ?? ""}`);
  const haystackTokens = new Set(haystack.split(" "));

  const wanted = lotTokens(lot);
  if (wanted.length === 0) {
    return {
      score: 0,
      confidence: "none",
      matched: [],
      reasons: ["lot has no place names"],
    };
  }

  const matched = wanted.filter((token) => haystackTokens.has(token));
  const reasons: string[] = [];
  const weigh = (token: string) => weights?.get(token) ?? 1;
  const total = wanted.reduce((sum, token) => sum + weigh(token), 0);
  let score =
    total > 0
      ? matched.reduce((sum, token) => sum + weigh(token), 0) / total
      : 0;

  const projectRefs = new Set([
    ...routeRefs(project.id.slice(3).replace(/-/g, " ")),
    ...routeRefs(project.name.en),
  ]);
  const noticeRefs = routeRefs(`${notice.title} ${notice.lotTitles ?? ""}`);
  const sharedRef = noticeRefs.find((ref) => projectRefs.has(ref));
  if (sharedRef) {
    score += 0.25;
    reasons.push(`route ref ${sharedRef}`);
  }

  // A notice published years from the recorded award is usually a different
  // procurement for the same stretch of road.
  const published = year(notice.publicationDate);
  const awarded =
    year(lot.dates?.tenderAwarded) ?? year(lot.dates?.constructionStart);
  if (published !== null && awarded !== null) {
    const gap = Math.abs(published - awarded);
    if (gap <= 2) {
      score += 0.15;
      reasons.push("published near the recorded award");
    } else if (gap > 6) {
      score -= 0.15;
      reasons.push(`published ${gap} years from the recorded award`);
    }
  }

  if (
    category === "maintenance" ||
    MAINTENANCE.some((word) => haystack.includes(word))
  ) {
    score *= 0.3;
    reasons.push("maintenance or framework notice");
  }

  // One shared name is a coincidence unless the road number agrees too.
  const strongEnough =
    matched.length >= 2 || (matched.length === 1 && sharedRef !== undefined);
  if (matched.length === 0 || !strongEnough) {
    return {
      score: matched.length === 0 ? 0 : Math.min(score, 0.25),
      confidence: "none",
      matched,
      reasons:
        matched.length === 0
          ? ["no shared place name"]
          : ["only one shared place name"],
    };
  }

  reasons.unshift(`${matched.length} of ${wanted.length} place names`);

  // At least one of the matched names has to be one this lot nearly owns.
  // Otherwise the notice matched only the corridor every neighbouring lot
  // carries in brackets, which identifies the road and not the section.
  if (!matched.some((token) => weigh(token) >= 0.5)) {
    return {
      score: Number(score.toFixed(3)),
      confidence: "none",
      matched,
      reasons: [...reasons, "only names shared with many other lots"],
    };
  }
  // "high" has to mean "almost certainly this lot", so it needs a name no
  // other lot uses. Without that, an A3 award reading "Autostrazii Brasov -
  // Targu Mures - Cluj - Oradea" comes back as a high-confidence match for the
  // A8 lot named "Targu Mures - Ditrau", which shares two of its three names
  // with that corridor and is a different motorway.
  const ownsAName = matched.some((token) => weigh(token) === 1);
  if (!ownsAName) reasons.push("no name unique to this lot");
  const capped = ownsAName ? score : Math.min(score, 0.74);

  const confidence: MatchConfidence =
    capped >= 0.75
      ? "high"
      : capped >= 0.5
        ? "medium"
        : capped >= 0.3
          ? "low"
          : "none";
  return { score: Number(score.toFixed(3)), confidence, matched, reasons };
}

/**
 * The contracted duration in months, when TED says so unambiguously.
 *
 * Nearly half the harvested notices state a number and no unit, and a few
 * state days. A duration is the input to every slip figure, so a guessed unit
 * would be worse than no figure: an unstated unit is passed through flagged
 * uncertain, and days are refused outright rather than divided by thirty.
 */
export function contractedMonths(
  notice: Pick<TedNotice, "durationValue" | "durationUnit">,
): { months: number; certain: boolean } | null {
  const value = notice.durationValue;
  if (value === null || !Number.isFinite(value) || value <= 0) return null;

  const units = [
    ...new Set(
      (notice.durationUnit ?? "")
        .split("|")
        .map((u) => u.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  if (units.length === 0) return { months: value, certain: false };
  if (units.length > 1) return null;
  return units[0] === "MONTH" ? { months: value, certain: true } : null;
}

/** Fields this notice could fill in on this lot, in the order shown. */
export function wouldAdd(notice: TedNotice, lot: Lot): string[] {
  const out: string[] = [];
  if (notice.value !== null && !lot.contract?.value) out.push("contract.value");
  if (contractedMonths(notice) && contractMonths(lot.contract ?? {}) === null) {
    out.push("contract.executionMonths");
  }
  if (notice.conclusionDate && !lot.dates?.tenderAwarded)
    out.push("dates.tenderAwarded");
  if (notice.winners && !lot.contractors?.length) out.push("contractors");
  return out;
}

export interface MatchRow {
  publicationNumber: string;
  publicationDate: string;
  noticeType: string;
  project: string;
  lot: string;
  confidence: MatchConfidence;
  score: number;
  matched: string;
  reasons: string;
  wouldAdd: string[];
  noticeValue: string;
  noticeDuration: string;
  winners: string;
  title: string;
  url: string;
}

export interface MatchOptions {
  /** Candidates kept per notice, best first. Default 3. */
  maxPerNotice?: number;
  /** Weakest confidence kept. Default "low". */
  minConfidence?: Exclude<MatchConfidence, "none">;
}

const RANK: Record<MatchConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

/** Every plausible notice-to-lot pairing, as review rows. */
export function matchNotices(
  notices: TedNotice[],
  projects: Project[],
  options: MatchOptions = {},
): MatchRow[] {
  const maxPerNotice = options.maxPerNotice ?? 3;
  const floor = RANK[options.minConfidence ?? "low"];
  const weights = tokenWeights(projects);
  const rows: MatchRow[] = [];

  for (const notice of notices) {
    const candidates: MatchRow[] = [];
    for (const project of projects) {
      for (const lot of project.lots) {
        const result = scoreNotice(notice, lot, project, weights);
        if (RANK[result.confidence] < floor) continue;
        const duration = contractedMonths(notice);
        candidates.push({
          publicationNumber: notice.publicationNumber,
          publicationDate: notice.publicationDate,
          noticeType: notice.noticeType ?? "",
          project: project.id,
          lot: lot.id,
          confidence: result.confidence,
          score: result.score,
          matched: result.matched.join(" "),
          reasons: result.reasons.join("; "),
          wouldAdd: wouldAdd(notice, lot),
          noticeValue:
            notice.value === null
              ? ""
              : `${notice.value} ${notice.currency ?? ""}`.trim(),
          noticeDuration: duration
            ? `${duration.months} months${duration.certain ? "" : " (unit unstated)"}`
            : "",
          winners: notice.winners ?? "",
          title: notice.title,
          url: notice.url ?? "",
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    rows.push(...candidates.slice(0, maxPerNotice));
  }

  return rows.sort(
    (a, b) =>
      b.score - a.score ||
      a.publicationNumber.localeCompare(b.publicationNumber) ||
      a.lot.localeCompare(b.lot),
  );
}
