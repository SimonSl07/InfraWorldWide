import { getLotMetrics } from "@/lib/data";
import { currentMonth } from "@/lib/slip";
import { rankByCountry } from "@/lib/rankings";
import { orderByMedianSlip } from "@/lib/performance";
import { contractorLeagueCsv, countryLeagueCsv } from "@/lib/league-csv";
import { loadContractorProfiles } from "../contractors/profiles";

/**
 * The downloadable league tables.
 *
 * Both are built from the same functions the pages render, so a figure in a
 * spreadsheet and the same figure on screen come from one code path.
 */

export function contractorsCsv(): string {
  return contractorLeagueCsv(loadContractorProfiles());
}

export function countriesCsv(): string {
  const metrics = getLotMetrics(currentMonth(new Date()));
  return countryLeagueCsv(orderByMedianSlip(rankByCountry(metrics)));
}

/** Headers shared by both CSV routes. */
export function csvHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "public, max-age=3600",
  };
}
