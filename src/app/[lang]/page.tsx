import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getProjects } from "@/lib/data";
import { computeStats } from "@/lib/stats";
import { pageMetadata } from "@/lib/page-metadata";
import { formatNumber } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang });
  // No title: the layout's default is the site name, which is what the home
  // page should be called. The description is the hero's, which says what is
  // actually here rather than repeating the tagline.
  return pageMetadata({
    locale: lang,
    path: "/",
    description: t("home.subtitle"),
    siteName: t("site.name"),
  });
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  setRequestLocale(lang);
  const t = await getTranslations("home");

  const stats = computeStats(getProjects(), new Date().getFullYear());

  const km = (value: number) => `${formatNumber(Math.round(value), lang)} km`;

  const statItems = [
    { value: formatNumber(stats.projectCount, lang), label: t("statsProjects") },
    { value: km(stats.openedKm), label: t("statsOpenedKm") },
    { value: km(stats.recentOpenedKm), label: t("statsRecentKm") },
    {
      value: km(stats.underConstructionKm),
      label: t("statsUnderConstructionKm"),
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-24">
      <h1 className="text-4xl sm:text-6xl font-bold tracking-tight max-w-3xl">
        {t("hero")}
      </h1>
      <p className="mt-6 text-lg text-ink-soft max-w-xl">{t("subtitle")}</p>
      <div className="mt-10 flex gap-4">
        <Link
          href="/map"
          className="rounded-full bg-inverse text-on-inverse px-6 py-3 text-sm font-medium hover:bg-inverse-soft"
        >
          {t("cta")}
        </Link>
        <Link
          href="/projects"
          className="rounded-full border border-line-strong px-6 py-3 text-sm font-medium hover:border-inverse"
        >
          {t("browseProjects")}
        </Link>
      </div>
      <dl className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-8">
        {statItems.map((s) => (
          <div key={s.label}>
            <dt className="text-sm text-ink-muted">{s.label}</dt>
            <dd className="mt-1 text-3xl font-bold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
