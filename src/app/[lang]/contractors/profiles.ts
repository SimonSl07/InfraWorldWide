import { getContractorProfiles } from "@/lib/data";
import { currentMonth } from "@/lib/slip";
import type { ContractorProfile } from "@/lib/contractor-directory";

/**
 * The contractor directory as of this month.
 *
 * Shared by the index, the per-firm page and the sitemap, so all three read
 * the one memoized build. It lives beside the routes rather than in a page
 * file, because a page module may only export the handful of names Next.js
 * recognises.
 */
export function loadContractorProfiles(): ContractorProfile[] {
  return getContractorProfiles(currentMonth(new Date()));
}
