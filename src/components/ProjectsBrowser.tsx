"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Category, Project, Status } from "@/lib/schema";
import { filterProjects } from "@/lib/projects-filter";
import {
  ALL_CATEGORIES,
} from "@/lib/map-style";
import { categoryVar } from "@/lib/map-theme";
import { statusSchema } from "@/lib/schema";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createCountryNamer } from "@/lib/country-names";
import { createLocalizer } from "@/lib/localized";
import {
  parseProjectsParams,
  serializeProjectsParams,
  type ProjectsParams,
} from "@/lib/projects-params";
import {
  PROJECT_SORTS,
  sortProjects,
  type ProjectSort,
} from "@/lib/projects-sort";

/**
 * The query string as an external store.
 *
 * useSearchParams would force a CSR bailout and take the static rendering of
 * the whole page with it, which is why the map, the header and the feedback
 * dialog all read `window.location` directly instead. Reading it through a
 * store keeps hydration honest: the static HTML carries no query string, so
 * the server snapshot is empty and the real one arrives in the re-render
 * immediately after.
 */
function subscribeToHistory(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}
const readSearch = () => window.location.search;
const noSearch = () => "";

const SORT_LABEL_KEY = {
  name: "projects.sortName",
  length: "projects.sortLength",
  country: "projects.sortCountry",
} as const satisfies Record<ProjectSort, string>;

export default function ProjectsBrowser({
  projects,
  lockedCountry,
}: {
  projects: Project[];
  /**
   * Fixes the browser to one country and drops the country picker — used on
   * a country page, where the list is already that country's and a picker
   * offering to switch away would be a dead control.
   */
  lockedCountry?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const fieldId = useId();

  const countries = useMemo(
    () => [...new Set(projects.map((p) => p.country))].sort(),
    [projects],
  );

  const search = useSyncExternalStore(subscribeToHistory, readSearch, noSearch);
  // The filters the URL states, and the edit made on top of it. The edit is
  // tagged with the query string it was written for, so going back or
  // forward (which changes the URL under it) falls through to the URL again
  // rather than showing a stale selection.
  const [edit, setEdit] = useState<{
    search: string;
    params: ProjectsParams;
  } | null>(null);

  const fromUrl = useMemo(
    () => parseProjectsParams(search, { countries, lockedCountry }),
    [search, countries, lockedCountry],
  );
  const filters = edit?.search === search ? edit.params : fromUrl;

  const set = <K extends keyof ProjectsParams>(
    key: K,
    value: ProjectsParams[K],
  ) => {
    const next = { ...filters, [key]: value };
    const qs = serializeProjectsParams(next, { lockedCountry });
    const query = qs ? `?${qs}` : "";
    // replaceState, not a navigation: the list is already rendered, and a
    // push would put every keystroke in the back history.
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query}`,
    );
    setEdit({ search: query, params: next });
  };

  const nameOfCountry = useMemo(() => createCountryNamer(locale), [locale]);
  const name = useMemo(() => createLocalizer(locale), [locale]);

  const visible = useMemo(() => {
    const matched = filterProjects(projects, filters);
    return sortProjects(matched, filters.sort, {
      locale,
      keyOf: (p) => ({
        name: name(p.name),
        country: nameOfCountry(p.country),
        // A line's own length, so track it shares with another line counts
        // here. Only totals spanning projects drop it.
        lengthKm: p.lots.reduce((sum, l) => sum + l.lengthKm, 0),
      }),
    });
  }, [projects, filters, locale, name, nameOfCountry]);

  const selectClass =
    "rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm";
  const labelClass =
    "block text-xs font-medium uppercase tracking-wide text-ink-muted";

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`${fieldId}-q`} className={labelClass}>
            {t("projects.searchLabel")}
          </label>
          <input
            id={`${fieldId}-q`}
            type="search"
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
            placeholder={t("projects.search")}
            className="mt-1 min-w-48 rounded-lg border border-line-strong px-3 py-1.5 text-sm"
          />
        </div>
        {!lockedCountry && (
          <div>
            <label htmlFor={`${fieldId}-country`} className={labelClass}>
              {t("projects.countryLabel")}
            </label>
            <select
              id={`${fieldId}-country`}
              value={filters.country ?? ""}
              onChange={(e) => set("country", e.target.value || null)}
              className={`${selectClass} mt-1`}
            >
              <option value="">{t("projects.allCountries")}</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {nameOfCountry(c)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={`${fieldId}-category`} className={labelClass}>
            {t("projects.categoryLabel")}
          </label>
          <select
            id={`${fieldId}-category`}
            value={filters.category ?? ""}
            onChange={(e) =>
              set("category", (e.target.value || null) as Category | null)
            }
            className={`${selectClass} mt-1`}
          >
            <option value="">{t("projects.allCategories")}</option>
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`category.${c}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-status`} className={labelClass}>
            {t("projects.statusLabel")}
          </label>
          <select
            id={`${fieldId}-status`}
            value={filters.status ?? ""}
            onChange={(e) =>
              set("status", (e.target.value || null) as Status | null)
            }
            className={`${selectClass} mt-1`}
          >
            <option value="">{t("projects.allStatuses")}</option>
            {statusSchema.options.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-sort`} className={labelClass}>
            {t("projects.sortLabel")}
          </label>
          <select
            id={`${fieldId}-sort`}
            value={filters.sort}
            onChange={(e) => set("sort", e.target.value as ProjectSort)}
            className={`${selectClass} mt-1`}
          >
            {PROJECT_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(SORT_LABEL_KEY[s])}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* How many rows the filters left, which the grid alone never said. */}
      <p aria-live="polite" className="mt-3 text-sm tabular-nums text-ink-muted">
        {t("projects.count", { count: visible.length })}
      </p>

      {visible.length === 0 ? (
        <p className="mt-8 text-ink-muted">{t("projects.empty")}</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => {
            const statuses = [...new Set(p.lots.map((l) => l.status))];
            const totalKm = p.lots.reduce((sum, l) => sum + l.lengthKm, 0);
            return (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="block h-full rounded-xl border border-line p-4 hover:border-inverse transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block w-4 h-1 rounded-full"
                      style={{ backgroundColor: categoryVar(p.category) }}
                    />
                    <span className="text-xs text-ink-muted uppercase">
                      {t(`category.${p.category}`)} · {nameOfCountry(p.country)}
                    </span>
                  </div>
                  <h3 className="mt-1 font-semibold leading-snug">
                    {name(p.name)}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {statuses.map((s) => (
                      <StatusBadge
                        key={s}
                        status={s}
                        label={t(`status.${s}`)}
                        className="text-[11px]"
                      />
                    ))}
                    <span className="text-xs text-ink-muted ml-auto">
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
