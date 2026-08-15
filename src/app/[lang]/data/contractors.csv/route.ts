import { routing } from "@/i18n/routing";
import { contractorsCsv, csvHeaders } from "../tables";

/**
 * The by-contractor league as CSV.
 *
 * The body is language-independent (ids and numbers), but the route sits
 * under [lang] because every route in the app does; the two locales serve
 * identical bytes.
 */
export function generateStaticParams() {
  return routing.locales.map((lang) => ({ lang }));
}

export const dynamic = "force-static";

export function GET() {
  return new Response(contractorsCsv(), {
    headers: csvHeaders("infraworldwide-contractors.csv"),
  });
}
