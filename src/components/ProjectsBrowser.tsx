"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Category, Project, Status } from "@/lib/schema";
import { filterProjects } from "@/lib/projects-filter";
import { ALL_CATEGORIES, CATEGORY_COLORS } from "@/lib/map-style";
import { statusSchema } from "@/lib/schema";

const STATUS_BADGE: Record<Status, string> = {
  opened: "bg-green-100 text-green-800",
  under_construction: "bg-amber-100 text-amber-800",
  tendered: "bg-blue-100 text-blue-800",
  planned: "bg-neutral-100 text-neutral-600",
  cancelled: "bg-red-100 text-red-700",
};

export default function ProjectsBrowser({ projects }: { projects: Project[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  const countries = useMemo(
    () => [...new Set(projects.map((p) => p.country))].sort(),
    [projects],
  );
  const countryNames = useMemo(
    () => new Intl.DisplayNames([locale], { type: "region" }),
    [locale],
  );

  const filtered = useMemo(
    () => filterProjects(projects, { query, country, category, status }),
    [projects, query, country, category, status],
  );

  const name = (s: { en: string; ro?: string }) =>
    locale === "ro" && s.ro ? s.ro : s.en;

  const selectClass =
    "rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("projects.search")}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm min-w-48"
        />
        <select
          value={country ?? ""}
          onChange={(e) => setCountry(e.target.value || null)}
          className={selectClass}
        >
          <option value="">{t("projects.allCountries")}</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {countryNames.of(c.toUpperCase())}
            </option>
          ))}
        </select>
        <select
          value={category ?? ""}
          onChange={(e) => setCategory((e.target.value || null) as Category | null)}
          className={selectClass}
        >
          <option value="">{t("projects.allCategories")}</option>
          {ALL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`category.${c}`)}
            </option>
          ))}
        </select>
        <select
          value={status ?? ""}
          onChange={(e) => setStatus((e.target.value || null) as Status | null)}
          className={selectClass}
        >
          <option value="">{t("projects.allStatuses")}</option>
          {statusSchema.options.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 text-neutral-500">{t("projects.empty")}</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const statuses = [...new Set(p.lots.map((l) => l.status))];
            const totalKm = p.lots.reduce((sum, l) => sum + l.lengthKm, 0);
            return (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="block h-full rounded-xl border border-neutral-200 p-4 hover:border-neutral-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-4 h-1 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[p.category] }}
                    />
                    <span className="text-xs text-neutral-500 uppercase">
                      {t(`category.${p.category}`)} ·{" "}
                      {countryNames.of(p.country.toUpperCase())}
                    </span>
                  </div>
                  <h3 className="mt-1 font-semibold leading-snug">{name(p.name)}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {statuses.map((s) => (
                      <span
                        key={s}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[s]}`}
                      >
                        {t(`status.${s}`)}
                      </span>
                    ))}
                    <span className="text-xs text-neutral-500 ml-auto">
                      {totalKm.toLocaleString(locale)} km
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
