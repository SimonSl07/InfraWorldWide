import { routing } from "@/i18n/routing";
import { countriesCsv, csvHeaders } from "../tables";

/** The by-country league as CSV. See the note in contractors.csv/route.ts. */
export function generateStaticParams() {
  return routing.locales.map((lang) => ({ lang }));
}

export const dynamic = "force-static";

export function GET() {
  return new Response(countriesCsv(), {
    headers: csvHeaders("infraworldwide-countries.csv"),
  });
}
