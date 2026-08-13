import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCountryTable, getProjects } from "@/lib/data";
import { currentMonth } from "@/lib/slip";
import { rankCountries } from "@/lib/country-stats";
import CountryCompare from "@/components/CountryCompare";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: "country" });
  return { title: t("indexTitle"), description: t("indexIntro") };
}

export default async function CountriesPage({
  params,
}: PageProps<"/[lang]/countries">) {
  const { lang } = await params;
  setRequestLocale(lang);
  const t = await getTranslations();

  const nowMonth = currentMonth(new Date());
  const ranked = rankCountries(
    getProjects(),
    getCountryTable().countries,
    nowMonth,
    nowMonth,
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold">{t("country.compareTitle")}</h1>
      <p className="mt-2 max-w-3xl text-neutral-600">
        {t("country.compareIntro")}
      </p>

      {/* CountryCompare reads ?compare= with useSearchParams; without this
          boundary the whole page would fall back to client rendering. */}
      <div className="mt-6">
        <Suspense>
          <CountryCompare countries={ranked} />
        </Suspense>
      </div>
    </div>
  );
}
