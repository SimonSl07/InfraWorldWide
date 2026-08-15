import { toCsv, type CsvValue } from "./csv";
import type { ContractorProfile } from "./contractor-directory";
import type { GroupRanking } from "./rankings";

/**
 * The two league tables as CSV, for anyone who would rather sort them
 * somewhere else.
 *
 * Columns are the underlying numbers, not the rendered strings: months and
 * percentages as plain numbers, the on-time figure as a share rather than a
 * rounded percentage, and the ids the rest of the dataset joins on. Sample
 * sizes travel beside every median, because a median of one section is not
 * the same claim as a median of twelve and a bare column would hide that.
 */

export const CONTRACTOR_CSV_COLUMNS = [
  "id",
  "name",
  "registered",
  "sections",
  "km",
  "median_slip_months",
  "slip_n",
  "on_time_share",
  "median_overrun_pct",
  "overrun_n",
  "countries",
] as const;

/**
 * Kilometres to millimetre precision.
 *
 * Summing sourced lengths leaves float noise behind (970.6390000000001 for a
 * figure whose inputs carry three decimals at most), and publishing that as
 * an exported number claims a precision the data does not have.
 */
function km(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Sample sizes are zero when nothing was measured; medians stay blank. */
function groupCells(ranking: GroupRanking | null): CsvValue[] {
  return [
    ranking?.slip.median ?? null,
    ranking?.slip.n ?? 0,
    ranking?.onTimeShare ?? null,
    ranking?.overrun.estimate.median ?? null,
    ranking?.overrun.estimate.n ?? 0,
  ];
}

export function contractorLeagueCsv(profiles: ContractorProfile[]): string {
  return toCsv(
    CONTRACTOR_CSV_COLUMNS,
    profiles.map((p) => [
      p.id,
      p.name,
      p.registered,
      p.countedSections,
      km(p.km),
      ...groupCells(p.ranking),
      // Space-separated so the cell never needs quoting, and so a spreadsheet
      // does not read the list as a number.
      p.countries.join(" "),
    ]),
  );
}

export const COUNTRY_CSV_COLUMNS = [
  "country",
  "sections",
  "km",
  "median_slip_months",
  "slip_n",
  "on_time_share",
  "median_overrun_pct",
  "overrun_n",
] as const;

export function countryLeagueCsv(groups: GroupRanking[]): string {
  return toCsv(
    COUNTRY_CSV_COLUMNS,
    groups.map((g) => [g.key, g.lots, km(g.km), ...groupCells(g)]),
  );
}
