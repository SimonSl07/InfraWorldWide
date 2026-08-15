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
import {
  buildContractorDirectory,
  type ContractorProfile,
} from "@/lib/contractor-directory";

/**
 * The contractor directory, wired to the committed artifacts.
 *
 * Shared by the index and the per-firm page so the two cannot be built on
 * different options: a different price year or deflator would give the same
 * firm two different overrun figures on two pages of the same site. It lives
 * beside the routes rather than in a page file, because a page module may
 * only export the handful of names Next.js recognises.
 */
export function loadContractorProfiles(): ContractorProfile[] {
  const deflators = getDeflators();
  const registry = getContractors();
  const deflate = createDeflator(deflators);

  return buildContractorDirectory(getProjects(), {
    registry,
    deflate,
    // Lets an overrun be measured when the estimate and the outturn were
    // recorded in different currencies, as on the performance page.
    convert: createConverter(getFxTable()),
    priceYear: commonLatestYear(deflators) ?? deflators.baseYear,
    resolve: createContractorResolver(registry),
    nowMonth: currentMonth(new Date()),
  });
}
