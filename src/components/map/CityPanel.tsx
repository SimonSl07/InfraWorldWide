"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import MapPanel from "./MapPanel";
import { countryName, flagEmoji } from "@/lib/country-names";
import { formatDate, formatKm, formatNumber } from "@/lib/format";
import { localized } from "@/lib/localized";
import type { City } from "@/lib/schema";
import type { CityMarkerProperties } from "@/lib/map-features";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { Figure } from "@/components/ui/Figure";

interface CityPanelProps {
  cityKey: string;
  city: City;
  /** Counts from the map marker, so the panel and the marker agree. */
  marker: CityMarkerProperties | null;
  onClose: () => void;
}

/**
 * The panel that opens when a city marker is clicked.
 *
 * City infrastructure is deliberately absent from the map behind this
 * panel, so the panel's job is to say what is there and hand the reader to
 * the city's own view rather than trying to summarise a network it cannot
 * show.
 */
export default function CityPanel({
  cityKey,
  city,
  marker,
  onClose,
}: CityPanelProps) {
  const t = useTranslations();
  const locale = useLocale();
  const name = localized(city.name, locale);
  const note = city.note ? localized(city.note, locale) : undefined;

  return (
    <MapPanel onClose={onClose} labelledBy="map-panel-city-heading">
      <div className="pr-8">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          {t("city.panelKicker")}
        </div>
        <h2
          id="map-panel-city-heading"
          className="text-xl font-bold leading-tight"
        >
          {name}
        </h2>
        <div className="mt-0.5 text-xs text-ink-muted">
          <span aria-hidden className="mr-1">
            {flagEmoji(city.country)}
          </span>
          {countryName(city.country, locale)}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Figure
          variant="compact"
          label={t("city.population")}
          value={formatNumber(city.population, locale)}
          note={`(${formatDate(city.populationDate, locale)})`}
        />
        {city.gdpPerCapita && (
          <Figure
            variant="compact"
            label={t("city.gdpPerCapita")}
            value={city.gdpPerCapita.amount.toLocaleString(locale, {
              style: "currency",
              currency: city.gdpPerCapita.currency,
              maximumFractionDigits: 0,
            })}
            note={`(${city.gdpPerCapita.year})`}
          />
        )}
      </div>

      {marker && (
        <div className="mt-4 rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink-soft">
          {t("city.networkSummary", {
            projects: marker.projects,
            lots: marker.lots,
            km: formatKm(marker.km, locale),
          })}
        </div>
      )}

      <p className="mt-3 text-xs text-ink-muted">{t("city.notOnMainMap")}</p>

      {note && (
        <p className="mt-3 border-t border-line-soft pt-3 text-xs text-ink-faint">
          {note}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={`/cities/${cityKey}`}
          className="rounded-lg bg-inverse px-3 py-2 text-sm font-medium text-on-inverse hover:bg-inverse-soft"
        >
          {t("city.seeMore")}
        </Link>
        {city.link && (
          <ExternalLink
            href={city.link}
            className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            {t("city.officialSite")}
          </ExternalLink>
        )}
      </div>
    </MapPanel>
  );
}
