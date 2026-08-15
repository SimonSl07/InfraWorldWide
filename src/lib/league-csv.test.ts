import { describe, it, expect } from "vitest";
import {
  CONTRACTOR_CSV_COLUMNS,
  COUNTRY_CSV_COLUMNS,
  contractorLeagueCsv,
  countryLeagueCsv,
} from "./league-csv";
import type { GroupRanking, LotMetric } from "./rankings";
import type { ContractorProfile } from "./contractor-directory";

/** Only the count is read from `built`, so stubs keep the fixture readable. */
const builtLots = (count: number): LotMetric[] =>
  Array.from({ length: count }, () => ({}) as LotMetric);

const stat = (n: number, median: number | null) => ({
  n,
  median,
  worst: median,
  best: median,
});

const group = (over: Partial<GroupRanking> = {}): GroupRanking => ({
  key: "astaldi",
  label: "Astaldi",
  lots: 3,
  km: 35,
  overrun: { estimate: stat(2, 22.9), award: stat(0, null) },
  slip: stat(3, 18),
  onTimeShare: 0.5,
  ...over,
});

const profile = (over: Partial<ContractorProfile> = {}): ContractorProfile => {
  const base: ContractorProfile = {
    id: "astaldi",
    name: "Astaldi",
    kind: "firm",
    registered: true,
    built: builtLots(3),
    otherRoles: [],
    countries: ["bg", "ro"],
    jointVentures: [],
    countedSections: 3,
    km: 35,
    ranking: group(),
    ranked: true,
    ...over,
  };
  // Default the counted basis to the built list unless a case sets it, so a
  // fixture overriding `built` cannot silently keep the wrong count.
  return over.countedSections === undefined
    ? { ...base, countedSections: base.built.length }
    : base;
};

describe("contractorLeagueCsv", () => {
  it("writes the header then one line per firm", () => {
    const csv = contractorLeagueCsv([profile()]);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(CONTRACTOR_CSV_COLUMNS.join(","));
    expect(lines[1]).toBe("astaldi,Astaldi,true,3,35,18,3,0.5,22.9,2,bg ro");
  });

  it("leaves unmeasured figures blank rather than zero", () => {
    // A firm with no measured slip is not a firm that delivered on time.
    const csv = contractorLeagueCsv([
      profile({
        id: "search",
        name: "Search",
        registered: false,
        built: builtLots(0),
        km: 0,
        ranking: null,
        ranked: false,
        countries: ["ro"],
      }),
    ]);
    expect(csv.trimEnd().split("\n")[1]).toBe(
      "search,Search,false,0,0,,0,,,0,ro",
    );
  });

  it("trims the float noise off a summed length", () => {
    // A sum of sourced lengths lands on 970.6390000000001; publishing that
    // claims a precision none of the inputs has.
    const csv = contractorLeagueCsv([profile({ km: 970.6390000000001 })]);
    expect(csv).toContain(",970.639,");
  });

  it("quotes a name that carries a comma", () => {
    const csv = contractorLeagueCsv([profile({ name: "Geiger, Max Bögl" })]);
    expect(csv).toContain('"Geiger, Max Bögl"');
  });
});

describe("countryLeagueCsv", () => {
  it("writes one line per country", () => {
    const csv = countryLeagueCsv([group({ key: "ro", label: "ro" })]);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(COUNTRY_CSV_COLUMNS.join(","));
    expect(lines[1]).toBe("ro,3,35,18,3,0.5,22.9,2");
  });

  it("writes a header even when nothing is measurable", () => {
    expect(countryLeagueCsv([])).toBe(`${COUNTRY_CSV_COLUMNS.join(",")}\n`);
  });
});
