"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { countryName, flagEmoji } from "@/lib/country-names";
import { formatDate, formatKm } from "@/lib/format";
import type { City } from "@/lib/schema";
import type { CityMarkerProps } from "./InfraMap";

interface CityPanelProps {
  cityKey: string;
  city: City;
  /** Counts from the map marker, so the panel and the marker agree. */
  marker: CityMarkerProps | null;
  onClose: () => void;
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-bold tabular-nums">
        {value}
        {note && (
          <span className="ml-1.5 text-xs font-normal text-neutral-400">
            {note}
          </span>
        )}
      </div>
    </div>
  );
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
  const name = locale === "ro" && city.name.ro ? city.name.ro : city.name.en;
  const note = locale === "ro" && city.note?.ro ? city.note.ro : city.note?.en;

  return (
    <aside className="absolute top-4 right-4 z-10 w-80 max-w-[calc(100%-2rem)] overflow-y-auto rounded-xl border border-neutral-200 bg-white/95 p-4 shadow-lg backdrop-blur max-h-[calc(100%-2rem)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            {t("city.panelKicker")}
          </div>
          <h2 className="text-xl font-bold leading-tight">{name}</h2>
          <div className="mt-0.5 text-xs text-neutral-500">
            <span aria-hidden className="mr-1">
              {flagEmoji(city.country)}
            </span>
            {countryName(city.country, locale)}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label={t("country.close")}
          className="shrink-0 rounded-full px-2 py-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
        >
          ×
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Figure
          label={t("city.population")}
          value={city.population.toLocaleString(locale)}
          note={`(${formatDate(city.populationDate, locale)})`}
        />
        {city.gdpPerCapita && (
          <Figure
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
        <div className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          {t("city.networkSummary", {
            projects: marker.projects,
            lots: marker.lots,
            km: formatKm(marker.km, locale),
          })}
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-500">{t("city.notOnMainMap")}</p>

      {note && (
        <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-400">
          {note}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={`/cities/${cityKey}`}
          className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          {t("city.seeMore")}
        </Link>
        {city.link && (
          <a
            href={city.link}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
          >
            {t("city.officialSite")}
          </a>
        )}
      </div>
    </aside>
  );
}
