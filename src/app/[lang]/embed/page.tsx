import { Suspense } from "react";
import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import EmbedMap from "@/components/map/EmbedMap";

/**
 * The map on its own, for an iframe.
 *
 * Same component and the same URL parameters as /map, without the site
 * header, footer or nav, so an article can drop the live time slider in at
 * whatever size it has room for. The OpenStreetMap attribution travels with
 * it: ODbL requires that, and the site footer is not present here.
 *
 * Deliberately not indexed. It is the same content as /map with the chrome
 * removed, and letting a search engine pick between them is how a reader
 * ends up on a page with no way back into the site.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EmbedPage({
  params,
}: PageProps<"/[lang]/embed">) {
  const { lang } = await params;
  setRequestLocale(lang);
  const t = await getTranslations({ locale: lang, namespace: "map" });

  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-surface-sunken">
          <p className="rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink-soft shadow">
            {t("loading")}
          </p>
        </div>
      }
    >
      <EmbedMap locale={lang} />
    </Suspense>
  );
}
