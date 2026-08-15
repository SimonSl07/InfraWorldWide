import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getProjects } from "@/lib/data";
import { getOpenings } from "@/lib/timeline";
import { buildOpeningsFeed } from "@/lib/feed";
import { siteUrl } from "@/lib/seo";

/** Past openings, newest first. Enough to be worth following, not the archive. */
const ITEM_LIMIT = 50;

export function generateStaticParams() {
  return routing.locales.map((lang) => ({ lang }));
}

export const dynamic = "force-static";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string }> },
) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: "projects" });
  const site = await getTranslations({ locale: lang, namespace: "site" });

  const { past } = getOpenings(getProjects());
  const xml = buildOpeningsFeed({
    baseUrl: siteUrl(process.env),
    locale: lang,
    title: `${site("name")}: ${t("pastOpenings")}`,
    description: site("tagline"),
    openings: past.slice(0, ITEM_LIMIT),
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
