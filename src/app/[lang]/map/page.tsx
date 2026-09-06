import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import MapExplorer from "@/components/map/MapExplorer";
import { pageMetadata } from "@/lib/page-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang });
  return pageMetadata({
    locale: lang,
    path: "/map",
    title: t("map.title"),
    description: t("map.metaDescription"),
    siteName: t("site.name"),
  });
}

export default async function MapPage({ params }: PageProps<"/[lang]/map">) {
  const { lang } = await params;
  setRequestLocale(lang);

  const t = await getTranslations({ locale: lang, namespace: "map" });

  return (
    // useSearchParams inside MapExplorer bails out to the client, so without
    // a fallback the whole viewport is blank until that resolves.
    <Suspense
      fallback={
        <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center bg-surface-sunken">
          <p className="rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink-soft shadow">
            {t("loading")}
          </p>
        </div>
      }
    >
      <MapExplorer locale={lang} />
    </Suspense>
  );
}
