/**
 * Refetches the two reference tables that put costs on one axis:
 *
 *   npx tsx scripts/refresh-indices.ts                 # dry run, prints a diff
 *   npx tsx scripts/refresh-indices.ts --write         # applies it
 *   npx tsx scripts/refresh-indices.ts --only fx
 *
 * data/deflators.json and data/fx.json were assembled by hand and neither
 * reaches 2026, which is why three committed costs priced in 2026 cannot be
 * restated or shown in euro. This makes the assembly repeatable.
 *
 * Sources, as recorded in each file's own `sources` block:
 *   deflators  Eurostat prc_hicp_aind, unit INX_A_AVG, coicop CP00, per geo.
 *              Free reuse under Commission decision 2011/833/EU.
 *   fx         ECB Data Portal EXR/A.<CUR>.EUR.SP00.A, annual averages. Free
 *              reuse with attribution. The ECB publishes no dinar, hryvnia or
 *              Moldovan leu rate, and its krona series has a hole from 2009
 *              to 2017, so RSD, MDL, UAH and ISK come from Eurostat
 *              ert_bil_eur_a, statinfo AVG, the substitution the fx note
 *              already documents.
 *
 * Deliberate refusals, which a naive refetch would undo:
 *   - USD deflator. The committed series is the US CPI-U (BLS, via FRED)
 *     rebased to 2015 = 100. Eurostat does publish a US HICP, but it is a
 *     different index (106.80 against 109.2 for 2020), so splicing one onto
 *     the other would corrupt every dollar comparison. This script leaves USD
 *     alone and says so.
 *   - GBP deflator. Eurostat's UK HICP stops in 2019 (the UK left the
 *     collection after Brexit), so the committed series is the ONS CPI index
 *     (D7BT, 2015 = 100), which is the UK's HICP-conformant measure.
 *   - MDL deflator. Entered by hand from the National Bureau of Statistics
 *     of Moldova (annual average CPI, previous year = 100, chained to 2015
 *     = 100). Eurostat publishes no Moldovan HICP.
 *   - Years listed in DELIBERATELY_ABSENT. The dinar's 1999 and 2000 figures
 *     are a frozen administered rate, not a rate anything could be converted
 *     at, and were left out on purpose.
 *
 * An annual average only exists once the year is over, so nothing here can
 * produce a 2026 figure during 2026. The 2026-priced costs stay unrestatable
 * until early 2027, whatever this script does.
 */
import fs from "node:fs";
import path from "node:path";
import {
  deflatorTableSchema,
  fxTableSchema,
  type DeflatorTable,
  type FxTable,
} from "../src/lib/schema";
import {
  diffSeries,
  formatSeriesDiff,
  parseEcbCsv,
  parseJsonStat,
  roundSeries,
  type SeriesChange,
  type YearValues,
} from "../src/lib/index-sources";

const EUROSTAT =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
const ECB = "https://data-api.ecb.europa.eu/service/data";

/** Eurostat reference area per deflator currency, or why it is not refetched. */
const DEFLATOR_GEO: Record<string, string> = {
  BGN: "BG",
  CZK: "CZ",
  DKK: "DK",
  EUR: "EA",
  HUF: "HU",
  PLN: "PL",
  RON: "RO",
  RSD: "RS",
  SEK: "SE",
  NOK: "NO",
  CHF: "CH",
  ISK: "IS",
  TRY: "TR",
};

const NOT_REFETCHED: Record<string, string> = {
  USD: "US CPI-U (BLS via FRED) rebased to 2015 = 100. Eurostat's US HICP is a different index and must not be spliced onto it.",
  GBP: "ONS CPI index D7BT, 2015 = 100. Eurostat's UK HICP ends in 2019 and the ONS series continues it.",
  MDL: "National Bureau of Statistics of Moldova, annual average CPI (previous year = 100) chained to 2015 = 100. Eurostat has no Moldovan HICP.",
};

/**
 * Currencies taken from Eurostat ert_bil_eur_a instead of the ECB. The ECB has
 * no dinar, hryvnia or Moldovan leu series, and its krona series is missing
 * 2009 to 2017 (Eurostat's is complete, at two decimals).
 */
const EUROSTAT_FX_CURRENCIES = ["RSD", "ISK", "MDL", "UAH"];

/** Currencies the ECB quotes in full. */
const ECB_CURRENCIES = [
  "BGN",
  "CZK",
  "DKK",
  "HUF",
  "PLN",
  "RON",
  "SEK",
  "NOK",
  "USD",
  "CHF",
  "GBP",
  "TRY",
];

/**
 * Years left out of a series on purpose, with the reason from the file's own
 * note. Without this a refetch would quietly reinstate them.
 */
const DELIBERATELY_ABSENT: Record<string, { years: string[]; why: string }> = {
  "fx:RSD": {
    years: ["1999", "2000"],
    why: "a frozen administered rate of exactly 11.735 dinars per euro, unified with the market rate only in December 2000",
  },
};

/** Decimals each table is kept at, so a refetch does not churn precision. */
const DEFLATOR_DECIMALS = 2;
const FX_DECIMALS = 4;

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function get(url: string, accept: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: accept,
      "User-Agent": "InfraWorldWide-data-refresh/0.1",
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

/** Reads a JSON file, remembering how it is punctuated so a write matches. */
function readWithStyle(file: string): { data: unknown; eol: string } {
  const raw = fs.readFileSync(file, "utf8");
  return { data: JSON.parse(raw), eol: raw.includes("\r\n") ? "\r\n" : "\n" };
}

function writeWithStyle(file: string, data: unknown, eol: string) {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(file, eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text);
}

function latest(series: YearValues): string {
  const years = Object.keys(series).sort();
  return years.length > 0 ? years[years.length - 1] : "(empty)";
}

interface SeriesResult {
  name: string;
  changes: SeriesChange[];
  fetched: YearValues;
}

/** Drops years the curator excluded on purpose, and reports that it did. */
function applyExclusions(name: string, fetched: YearValues): YearValues {
  const rule = DELIBERATELY_ABSENT[name];
  if (!rule) return fetched;
  const kept: YearValues = { ...fetched };
  const dropped: string[] = [];
  for (const year of rule.years) {
    if (year in kept) {
      delete kept[year];
      dropped.push(year);
    }
  }
  if (dropped.length > 0) {
    console.log(`  ${name}: keeping ${dropped.join(", ")} out, ${rule.why}`);
  }
  return kept;
}

async function refreshDeflators(root: string): Promise<SeriesResult[]> {
  const file = path.join(root, "data/deflators.json");
  const { data, eol } = readWithStyle(file);
  const table = deflatorTableSchema.parse(data) as DeflatorTable;

  const geos = Object.keys(table.series)
    .filter((currency) => DEFLATOR_GEO[currency])
    .map((currency) => DEFLATOR_GEO[currency]);
  const url =
    `${EUROSTAT}/prc_hicp_aind?format=JSON&unit=INX_A_AVG&coicop=CP00` +
    `&sinceTimePeriod=1996&${geos.map((g) => `geo=${g}`).join("&")}`;

  console.log(`Eurostat prc_hicp_aind: ${geos.join(", ")}`);
  const byGeo = parseJsonStat(
    JSON.parse(await get(url, "application/json")),
    "geo",
  );

  const results: SeriesResult[] = [];
  for (const [currency, series] of Object.entries(table.series)) {
    if (NOT_REFETCHED[currency]) {
      console.log(`  ${currency}: not refetched. ${NOT_REFETCHED[currency]}`);
      continue;
    }
    const geo = DEFLATOR_GEO[currency];
    const raw = byGeo[geo];
    if (!raw) {
      console.log(`  ${currency}: Eurostat returned no ${geo} series`);
      continue;
    }
    const fetched = applyExclusions(
      `deflator:${currency}`,
      roundSeries(raw, DEFLATOR_DECIMALS),
    );
    const changes = diffSeries(series.index, fetched);
    results.push({ name: `deflator:${currency}`, changes, fetched });
    console.log(
      `  ${currency} (${geo}): ${Object.keys(fetched).length} year(s) to ${latest(fetched)}, committed to ${latest(series.index)}`,
    );
    if (flag("--write") && changes.length > 0) series.index = fetched;
  }

  if (flag("--write") && results.some((r) => r.changes.length > 0)) {
    deflatorTableSchema.parse(table);
    writeWithStyle(file, table, eol);
    console.log(`  wrote ${path.relative(root, file)}`);
  }
  return results;
}

async function refreshFx(
  root: string,
  endYear: number,
): Promise<SeriesResult[]> {
  const file = path.join(root, "data/fx.json");
  const { data, eol } = readWithStyle(file);
  const table = fxTableSchema.parse(data) as FxTable;

  const wanted = Object.keys(table.rates);
  const fromEcb = wanted.filter((c) => ECB_CURRENCIES.includes(c));
  const fetched: Record<string, YearValues> = {};

  if (fromEcb.length > 0) {
    const url = `${ECB}/EXR/A.${fromEcb.join("+")}.EUR.SP00.A?format=csvdata&startPeriod=1999&endPeriod=${endYear}`;
    console.log(`ECB EXR annual averages: ${fromEcb.join(", ")}`);
    Object.assign(fetched, parseEcbCsv(await get(url, "text/csv")));
  }

  // The ECB has no dinar, hryvnia or Moldovan leu series at all, which is why
  // the fx note documents Eurostat as the substitute rather than treating the
  // gap as an outage.
  const fromEurostat = wanted.filter((c) => EUROSTAT_FX_CURRENCIES.includes(c));
  if (fromEurostat.length > 0) {
    const url = `${EUROSTAT}/ert_bil_eur_a?format=JSON&${fromEurostat.map((c) => `currency=${c}`).join("&")}&statinfo=AVG&unit=NAC&sinceTimePeriod=1999`;
    console.log(
      `Eurostat ert_bil_eur_a: ${fromEurostat.join(", ")} (no complete ECB series)`,
    );
    const byCurrency = parseJsonStat(
      JSON.parse(await get(url, "application/json")),
      "currency",
    );
    Object.assign(fetched, byCurrency);
  }

  const results: SeriesResult[] = [];
  for (const [currency, series] of Object.entries(table.rates)) {
    const raw = fetched[currency];
    if (!raw) {
      console.log(`  ${currency}: no rows returned`);
      continue;
    }
    const next = applyExclusions(
      `fx:${currency}`,
      roundSeries(raw, FX_DECIMALS),
    );
    const changes = diffSeries(series.perEur, next);
    results.push({ name: `fx:${currency}`, changes, fetched: next });
    console.log(
      `  ${currency}: ${Object.keys(next).length} year(s) to ${latest(next)}, committed to ${latest(series.perEur)}`,
    );
    if (flag("--write") && changes.length > 0) series.perEur = next;
  }

  if (flag("--write") && results.some((r) => r.changes.length > 0)) {
    fxTableSchema.parse(table);
    writeWithStyle(file, table, eol);
    console.log(`  wrote ${path.relative(root, file)}`);
  }
  return results;
}

async function main() {
  const root = process.cwd();
  const only = arg("--only");
  const endYear = Number(arg("--end-year") ?? new Date().getFullYear());
  const write = flag("--write");

  if (only && !["deflators", "fx"].includes(only)) {
    console.error(`unknown --only "${only}" (expected deflators or fx)`);
    process.exit(2);
  }
  console.log(
    write
      ? "Refreshing reference tables."
      : "Dry run. Nothing is written without --write.\n",
  );

  const results: SeriesResult[] = [];
  const failures: string[] = [];

  if (only !== "fx") {
    try {
      results.push(...(await refreshDeflators(root)));
    } catch (e) {
      failures.push(`deflators: ${(e as Error).message}`);
    }
  }
  if (only !== "deflators") {
    try {
      results.push(...(await refreshFx(root, endYear)));
    } catch (e) {
      failures.push(`fx: ${(e as Error).message}`);
    }
  }

  const changed = results.filter((r) => r.changes.length > 0);
  console.log("");
  if (changed.length === 0) {
    console.log("Every series matches the published source. Nothing to do.");
  } else {
    for (const result of changed) {
      console.log(formatSeriesDiff(result.name, result.changes));
    }
    if (!write) {
      console.log(
        "\nRerun with --write to apply, then run npm run data:validate.",
      );
    }
  }

  if (failures.length > 0) {
    console.error("\nSource requests that failed (no values were guessed):");
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("refresh-indices.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
