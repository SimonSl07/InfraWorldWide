/**
 * Harvests public contract-award notices from TED (Tenders Electronic Daily),
 * the EU's official procurement register:
 *
 *   npx tsx scripts/fetch-ted-contracts.ts --country BG \
 *     --out data/ted/bg.json [--from 2008] [--cpv 45233110,45233120] [--max 2000]
 *
 * Award notices carry the two facts this dataset is worst at sourcing by hand:
 * the price a contract was actually awarded at, and the duration the
 * contractor signed up to. Both feed the delivery-performance rankings.
 *
 * The output is a raw harvest, deliberately NOT matched to lots — a TED
 * notice titled "Bulgaria-Sofia: Road construction works" may be a motorway
 * section or a village resurfacing. Matching is a separate, reviewable step.
 *
 * TED data is published by the EU under a permissive reuse policy; keep the
 * publication number so any figure can be traced back to its notice.
 */
import fs from "node:fs";
import path from "node:path";

const ENDPOINT = "https://api.ted.europa.eu/v3/notices/search";

/** CPV codes for transport infrastructure works. */
const DEFAULT_CPV = [
  "45233110", // motorway construction
  "45233120", // road construction
  "45233130", // highway construction
  "45233100", // road/motorway construction generally
  "45234100", // railway construction
  "45221100", // bridge construction
  "45221200", // tunnels/shafts
  "45234110", // mainline rail
];

const FIELDS = [
  "publication-number",
  "publication-date",
  "notice-title",
  "title-lot",
  "buyer-name",
  "winner-name",
  "organisation-name-tenderer",
  "total-value",
  "total-value-cur",
  "result-value-lot",
  "result-value-cur-lot",
  "contract-duration-period-lot",
  "duration-period-unit-lot",
  "contract-conclusion-date",
  "place-of-performance-city-lot",
  "classification-cpv",
];

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

/** ISO-2 to the ISO-3 code TED expects for place of performance. */
const ISO3: Record<string, string> = {
  BG: "BGR", RO: "ROU", HU: "HUN", PL: "POL", HR: "HRV", GR: "GRC",
  SK: "SVK", CZ: "CZE", SI: "SVN", AT: "AUT", DE: "DEU", FR: "FRA",
  IT: "ITA", ES: "ESP", PT: "PRT", NL: "NLD", BE: "BEL", LU: "LUX",
  DK: "DNK", SE: "SWE", FI: "FIN", EE: "EST", LV: "LVA", LT: "LTU",
  IE: "IRL", CY: "CYP", MT: "MLT",
};

/** TED returns multilingual objects; prefer English, else the first value. */
function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(" | ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return text(o.eng ?? o.en ?? Object.values(o)[0]);
  }
  return String(v);
}

function firstNumber(v: unknown): number | null {
  if (v == null) return null;
  const flat = Array.isArray(v) ? v : [v];
  for (const x of flat) {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export interface TedAward {
  publicationNumber: string;
  publicationDate: string;
  conclusionDate: string;
  title: string;
  lotTitles: string;
  buyer: string;
  winners: string;
  /** Award value in WHOLE units of `currency` — not millions. */
  value: number | null;
  currency: string;
  durationValue: number | null;
  durationUnit: string;
  cities: string;
  cpv: string;
  url: string;
}

/** One page of the TED search response; field values are multilingual blobs. */
interface TedPage {
  totalNoticeCount?: number;
  total?: number;
  notices?: Array<Record<string, unknown>>;
}

async function search(body: unknown, attempt = 0): Promise<TedPage> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`TED ${res.status} after ${attempt} retries`);
    const wait = 2000 * (attempt + 1);
    console.log(`  TED ${res.status}; retrying in ${wait / 1000}s…`);
    await new Promise((r) => setTimeout(r, wait));
    return search(body, attempt + 1);
  }
  if (!res.ok) throw new Error(`TED ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function main() {
  const country = (arg("--country") ?? "").toUpperCase();
  const out = arg("--out");
  if (!country || !out) {
    console.error(
      "usage: fetch-ted-contracts.ts --country BG --out data/ted/bg.json [--from 2008] [--cpv a,b] [--max 2000]",
    );
    process.exit(1);
  }
  const iso3 = ISO3[country];
  if (!iso3) {
    console.error(`${country} is not an EU member state — TED has no notices for it.`);
    process.exit(1);
  }

  const cpv = (arg("--cpv") ?? DEFAULT_CPV.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const from = arg("--from");
  const max = Number(arg("--max", "2000"));
  const limit = 100;

  const clauses = [
    `(place-of-performance IN (${iso3}))`,
    `(classification-cpv IN (${cpv.join(" ")}))`,
    `(notice-type IN (can-standard can-social))`,
  ];
  if (from) clauses.push(`(publication-date >= ${from}0101)`);
  const query = clauses.join(" AND ");

  console.log(`TED harvest: ${country} (${iso3}), ${cpv.length} CPV codes${from ? `, from ${from}` : ""}`);

  const awards: TedAward[] = [];
  let page = 1;
  let total = 0;

  while (awards.length < max) {
    const json = await search({ query, fields: FIELDS, page, limit, scope: "ALL" });
    total = json.totalNoticeCount ?? json.total ?? 0;
    const notices = json.notices ?? [];
    if (notices.length === 0) break;

    for (const n of notices) {
      const pub = text(n["publication-number"]);
      awards.push({
        publicationNumber: pub,
        publicationDate: String(text(n["publication-date"])).slice(0, 10),
        conclusionDate: String(text(n["contract-conclusion-date"])).slice(0, 10),
        title: text(n["notice-title"]),
        lotTitles: text(n["title-lot"]).slice(0, 600),
        buyer: text(n["buyer-name"]),
        winners: text(n["winner-name"] ?? n["organisation-name-tenderer"]),
        value: firstNumber(n["total-value"] ?? n["result-value-lot"]),
        currency: text(n["total-value-cur"] ?? n["result-value-cur-lot"]),
        durationValue: firstNumber(n["contract-duration-period-lot"]),
        durationUnit: text(n["duration-period-unit-lot"]),
        cities: text(n["place-of-performance-city-lot"]).slice(0, 300),
        cpv: text(n["classification-cpv"]).slice(0, 120),
        url: pub ? `https://ted.europa.eu/en/notice/-/detail/${pub}` : "",
      });
    }
    console.log(`  page ${page}: +${notices.length} (${awards.length}/${Math.min(total, max)})`);
    if (awards.length >= total) break;
    page++;
  }

  const withValue = awards.filter((a) => a.value !== null).length;
  const withDuration = awards.filter((a) => a.durationValue !== null).length;
  const withWinner = awards.filter((a) => a.winners).length;

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify(
      { country, iso3, cpv, from: from ?? null, totalMatching: total, harvested: awards.length, awards },
      null,
      2,
    ),
  );

  console.log(
    `✓ ${awards.length} award notice(s) of ${total} matching → ${out}\n` +
      `  with value: ${withValue}  with duration: ${withDuration}  with winner: ${withWinner}`,
  );
}

if (process.argv[1] && process.argv[1].endsWith("fetch-ted-contracts.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
