"use client";

import { useTranslations } from "next-intl";
import { BASEMAPS } from "@/lib/basemaps";

/**
 * Switches the basemap style.
 *
 * Not a satellite switch: see the note in src/lib/basemaps.ts. No global
 * high-resolution imagery is available without an API key or a licence
 * this project cannot honour, so the choice is between OpenFreeMap's own
 * styles, which the footer already attributes.
 */
export default function BasemapToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations();
  return (
    <div
      role="group"
      aria-label={t("map.basemap")}
      className="flex overflow-hidden rounded-full border border-line bg-surface/95 shadow backdrop-blur"
    >
      {BASEMAPS.map((map) => (
        <button
          key={map.id}
          type="button"
          onClick={() => onChange(map.id)}
          aria-pressed={map.id === value}
          className={`cursor-pointer px-2.5 py-1 text-[11px] font-medium transition-colors ${
            map.id === value
              ? "bg-inverse text-on-inverse"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          {t(map.labelKey)}
        </button>
      ))}
    </div>
  );
}
