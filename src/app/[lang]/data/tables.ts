import {
  getContractors,
  getDeflators,
  getFxTable,
  getProjects,
} from "@/lib/data";
import { commonLatestYear, createDeflator } from "@/lib/deflator";
import { createConverter } from "@/lib/fx";
import { createContractorResolver } from "@/lib/contractors";
import { currentMonth } from "@/lib/slip";
import { collectLotMetrics, rankByCountry } from "@/lib/rankings";
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
  const deflators = getDeflators();
  const deflate = createDeflator(deflators);
  const metrics = collectLotMetrics(getProjects(), {
    deflate,
    convert: createConverter(getFxTable()),
    priceYear: commonLatestYear(deflators) ?? deflators.baseYear,
    resolve: createContractorResolver(getContractors()),
    nowMonth: currentMonth(new Date()),
  });
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
