"use client";

import { useTranslations } from "next-intl";
import MapExplorer from "./MapExplorer";

/**
 * The map with the site's chrome removed, for dropping into an article.
 *
 * It is the same MapExplorer, so every URL parameter the main map already
 * understands works unchanged: ?t=, ?cat=, ?st=, ?sel=, ?c=, ?city=, ?v=,
 * ?bm=, ?cmp= and ?speed=. That is the point of the route: a link that
 * frames a view is also the embed code for that view.
 *
 * The only additions are the height, which has to fill the iframe rather
 * than the viewport minus a header that is not there, and an attribution
 * strip, because the page footer that normally carries the OpenStreetMap
 * and OpenFreeMap credit is gone and that credit is not optional.
 */
export default function EmbedMap({ locale }: { locale: string }) {
  const t = useTranslations();

  return (
    <div className="relative flex h-dvh w-full flex-col bg-surface">
      <div className="min-h-0 flex-1">
        <MapExplorer locale={locale} fillParent />
      </div>

      {/* ODbL requires the attribution to travel with the geometry, so it
          cannot be left behind with the site footer. */}
      <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-3 py-1.5 text-[11px] text-ink-muted">
        <span>{t("footer.mapData")}</span>
        <a
          href={`/${locale}/map`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
        >
          {t("embed.openFull")}
        </a>
      </div>
    </div>
  );
}
