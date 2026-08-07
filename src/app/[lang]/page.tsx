import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getProjects } from "@/lib/data";
import { computeStats } from "@/lib/stats";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  setRequestLocale(lang);
  const t = await getTranslations("home");

  const stats = computeStats(getProjects(), new Date().getFullYear());

  const statItems = [
    { value: stats.projectCount, label: t("statsProjects") },
    { value: `${Math.round(stats.openedKm).toLocaleString(lang)} km`, label: t("statsOpenedKm") },
    { value: `${Math.round(stats.recentOpenedKm).toLocaleString(lang)} km`, label: t("statsRecentKm") },
    { value: `${Math.round(stats.underConstructionKm).toLocaleString(lang)} km`, label: t("statsUnderConstructionKm") },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-24">
      <h1 className="text-4xl sm:text-6xl font-bold tracking-tight max-w-3xl">
        {t("hero")}
      </h1>
      <p className="mt-6 text-lg text-neutral-600 max-w-xl">{t("subtitle")}</p>
      <div className="mt-10 flex gap-4">
        <Link
          href="/map"
          className="rounded-full bg-neutral-900 text-white px-6 py-3 text-sm font-medium hover:bg-neutral-700"
        >
          {t("cta")}
        </Link>
        <Link
          href="/projects"
          className="rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium hover:border-neutral-900"
        >
          {t("browseProjects")}
        </Link>
      </div>
      <dl className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-8">
        {statItems.map((s) => (
          <div key={s.label}>
            <dt className="text-sm text-neutral-500">{s.label}</dt>
            <dd className="mt-1 text-3xl font-bold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
