import { describe, expect, it } from "vitest";
import {
  diffSeries,
  formatSeriesDiff,
  parseEcbCsv,
  parseJsonStat,
  roundSeries,
} from "./index-sources";

/**
 * Captured 2026-08-14 from
 * ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_aind
 *   ?format=JSON&unit=INX_A_AVG&coicop=CP00&geo=BG&geo=RS&sinceTimePeriod=2023
 * with the `extension` block (a page of HTML prose) dropped.
 */
const HICP_SAMPLE = {
  version: "2.0",
  class: "dataset",
  label: "HICP - annual data (average index and rate of change) (1996-2025)",
  source: "ESTAT",
  updated: "2026-02-06T23:00:00+0100",
  value: { "0": 134.15, "1": 137.63, "2": 142.5, "3": 144.2, "4": 151.1, "5": 157.3 },
  status: { "3": "d", "4": "d", "5": "d" },
  id: ["freq", "unit", "coicop", "geo", "time"],
  size: [1, 1, 1, 2, 3],
  dimension: {
    freq: { label: "Time frequency", category: { index: { A: 0 }, label: { A: "Annual" } } },
    unit: {
      label: "Unit of measure",
      category: { index: { INX_A_AVG: 0 }, label: { INX_A_AVG: "Annual average index" } },
    },
    coicop: {
      label: "Classification of individual consumption by purpose (COICOP)",
      category: { index: { CP00: 0 }, label: { CP00: "All-items HICP" } },
    },
    geo: {
      label: "Geopolitical entity (reporting)",
      category: { index: { BG: 0, RS: 1 }, label: { BG: "Bulgaria", RS: "Serbia" } },
    },
    time: {
      label: "Time",
      category: {
        index: { "2023": 0, "2024": 1, "2025": 2 },
        label: { "2023": "2023", "2024": "2024", "2025": "2025" },
      },
    },
  },
};

/**
 * The same endpoint asked for 1996 onward: Bulgaria has no 1996 figure, so its
 * cell is simply absent from `value`. Eurostat leaves the gap rather than
 * sending a null, which is the trap a dense-array reader falls into.
 */
const SPARSE_SAMPLE = {
  value: { "0": 71.74, "1": 72.87, "3": 40.27 },
  id: ["geo", "time"],
  size: [2, 2],
  dimension: {
    geo: { category: { index: { EA: 0, BG: 1 } } },
    time: { category: { index: { "1996": 0, "1997": 1 } } },
  },
};

/**
 * Captured 2026-08-14 from
 * data-api.ecb.europa.eu/service/data/EXR/A.USD+RON+BGN.EUR.SP00.A
 *   ?format=csvdata&startPeriod=1999&endPeriod=2026
 * three rows of thirty-two columns. TITLE_COMPL contains commas inside quotes,
 * which is why this cannot be split on the comma.
 */
const ECB_SAMPLE = [
  "KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,OBS_STATUS,OBS_CONF,OBS_PRE_BREAK,OBS_COM,TIME_FORMAT,BREAKS,COLLECTION,COMPILING_ORG,DISS_ORG,DOM_SER_IDS,PUBL_ECB,PUBL_MU,PUBL_PUBLIC,UNIT_INDEX_BASE,COMPILATION,COVERAGE,DECIMALS,NAT_TITLE,SOURCE_AGENCY,SOURCE_PUB,TITLE,TITLE_COMPL,UNIT,UNIT_MULT",
  'EXR.A.BGN.EUR.SP00.A,A,BGN,EUR,SP00,A,2000,1.9477448275862,A,F,,,P1Y,,A,,,,,,,,,,4,,4F0,,Euro/Bulgarian lev,"ECB reference exchange rate, Euro/Bulgarian lev, 2:15 pm (C.E.T.)",BGN,0',
  'EXR.A.BGN.EUR.SP00.A,A,BGN,EUR,SP00,A,2001,1.9481913385827,A,F,,,P1Y,,A,,,,,,,,,,4,,4F0,,Euro/Bulgarian lev,"ECB reference exchange rate, Euro/Bulgarian lev, 2:15 pm (C.E.T.)",BGN,0',
  'EXR.A.USD.EUR.SP00.A,A,USD,EUR,SP00,A,2025,1.1299831372549,A,F,,,P1Y,,A,,,,,,,,,,4,,4F0,,Euro/US dollar,"ECB reference exchange rate, Euro/US dollar, 2:15 pm (C.E.T.)",USD,0',
  "",
].join("\n");

describe("parseJsonStat", () => {
  it("reads a series per category of the chosen dimension", () => {
    const series = parseJsonStat(HICP_SAMPLE, "geo");
    expect(Object.keys(series).sort()).toEqual(["BG", "RS"]);
    expect(series.BG).toEqual({ "2023": 134.15, "2024": 137.63, "2025": 142.5 });
    expect(series.RS).toEqual({ "2023": 144.2, "2024": 151.1, "2025": 157.3 });
  });

  it("skips cells the source simply omits", () => {
    const series = parseJsonStat(SPARSE_SAMPLE, "geo");
    expect(series.EA).toEqual({ "1996": 71.74, "1997": 72.87 });
    expect(series.BG).toEqual({ "1997": 40.27 });
  });

  it("throws when the dimension is not in the response", () => {
    expect(() => parseJsonStat(HICP_SAMPLE, "currency")).toThrow(/currency/);
  });

  it("throws on a response that is not JSON-stat", () => {
    expect(() => parseJsonStat({ error: "quota exceeded" }, "geo")).toThrow();
  });
});

describe("parseEcbCsv", () => {
  it("reads one series per currency, keyed by year", () => {
    const series = parseEcbCsv(ECB_SAMPLE);
    expect(Object.keys(series).sort()).toEqual(["BGN", "USD"]);
    expect(series.BGN["2000"]).toBeCloseTo(1.9477448275862, 10);
    expect(series.USD).toEqual({ "2025": 1.1299831372549 });
  });

  it("does not split a quoted field containing commas", () => {
    // TITLE_COMPL holds "…, 2:15 pm (C.E.T.)". Splitting naively shifts every
    // later column and silently reads the wrong one.
    expect(parseEcbCsv(ECB_SAMPLE).BGN["2001"]).toBeCloseTo(1.9481913385827, 10);
  });

  it("ignores rows that are not annual observations", () => {
    const monthly = ECB_SAMPLE.replace(",A,BGN,EUR,SP00,A,2000,", ",M,BGN,EUR,SP00,A,2000-01,");
    expect(parseEcbCsv(monthly).BGN["2000"]).toBeUndefined();
  });

  it("returns nothing for an empty body rather than throwing", () => {
    expect(parseEcbCsv("")).toEqual({});
  });
});

describe("roundSeries", () => {
  it("rounds to the precision the committed tables are kept at", () => {
    expect(roundSeries({ "2000": 1.9477448275862, "2025": 1.1299831372549 }, 4)).toEqual({
      "2000": 1.9477,
      "2025": 1.13,
    });
    expect(roundSeries({ "2015": 100.0 }, 2)).toEqual({ "2015": 100 });
  });
});

describe("diffSeries", () => {
  it("finds nothing when the fetch agrees with what is committed", () => {
    expect(diffSeries({ "2024": 1.0824 }, { "2024": 1.0824 })).toEqual([]);
  });

  it("reports a new year, a dropped year and a revised figure", () => {
    const changes = diffSeries(
      { "2023": 1.0813, "2024": 1.0824 },
      { "2024": 1.0825, "2025": 1.13 },
    );
    expect(changes).toEqual([
      { year: "2023", before: 1.0813, after: null, kind: "removed" },
      { year: "2024", before: 1.0824, after: 1.0825, kind: "changed" },
      { year: "2025", before: null, after: 1.13, kind: "added" },
    ]);
  });

  it("ignores float noise, but not a revision at the published precision", () => {
    expect(diffSeries({ "2024": 1.0824 }, { "2024": 1.0824 + 1e-13 })).toEqual([]);
    expect(diffSeries({ "2024": 1.0824 }, { "2024": 1.0825 })).toHaveLength(1);
  });
});

describe("formatSeriesDiff", () => {
  it("prints one line per change under the series name", () => {
    const text = formatSeriesDiff("USD", diffSeries({ "2024": 1.08 }, { "2025": 1.13 }));
    expect(text).toContain("USD");
    expect(text).toContain("+ 2025: 1.13");
    expect(text).toContain("- 2024: 1.08");
    expect(text).not.toContain("—");
  });

  it("is empty when the series did not move", () => {
    expect(formatSeriesDiff("USD", [])).toBe("");
  });
});
