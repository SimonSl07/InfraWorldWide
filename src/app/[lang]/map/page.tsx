import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import MapExplorer from "@/components/map/MapExplorer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: "map" });
  return { title: t("title") };
}

export default async function MapPage({ params }: PageProps<"/[lang]/map">) {
  const { lang } = await params;
  setRequestLocale(lang);

  return (
    <Suspense>
      <MapExplorer locale={lang} />
    </Suspense>
  );
}
