"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import CityMiniMap from "@/components/map/CityMiniMap";
import { categoryVar } from "@/lib/map-theme";
import type { Category } from "@/lib/schema";

/** One project's card, already localized and totalled by the page. */
export interface CityProjectCard {
  id: string;
  name: string;
  description: string;
  category: Category;
  /** Preformatted, so the client does no locale number work. */
  openedKm: string;
  totalKm: string;
  lots: number;
}

/**
 * The city map and its project list, sharing one selection.
 *
 * They are a single client component because the selection has to cross
 * between them: clicking a line on the map has to mark the matching card,
 * which means the state cannot live inside either one.
 */
export default function CityView({
  cityKey,
  projects,
}: {
  cityKey: string;
  projects: CityProjectCard[];
}) {
  const t = useTranslations();
  const [selected, setSelected] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLLIElement | null>>({});
  // Only scroll when the map drove the change, so landing on the page or
  // clearing the selection never yanks the viewport around.
  const scrollWanted = useRef(false);

  const handleSelect = useCallback((projectId: string | null) => {
    scrollWanted.current = projectId !== null;
    setSelected(projectId);
  }, []);

  useEffect(() => {
    if (!scrollWanted.current || selected === null) return;
    scrollWanted.current = false;
    cardRefs.current[selected]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [selected]);

  const selectedName = projects.find((p) => p.id === selected)?.name;

  return (
    <>
      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("city.mapTitle")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          {t("city.mapIntro")}
        </p>

        <div className="mt-4">
          <CityMiniMap
            cityKey={cityKey}
            selectedProjectId={selected}
            onSelectProject={handleSelect}
          />
        </div>

        <div className="mt-2 flex min-h-6 items-center gap-3 text-sm">
          {selectedName ? (
            <>
              <span className="text-ink-soft">
                {t("city.selected", { project: selectedName })}
              </span>
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className="text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                {t("city.clearSelection")}
              </button>
            </>
          ) : (
            <span className="text-ink-faint">{t("city.selectHint")}</span>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("city.projectsTitle")}</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {projects.map((project) => {
            const on = selected === project.id;
            return (
              <li
                key={project.id}
                ref={(el) => {
                  cardRefs.current[project.id] = el;
                }}
                // Marks the card for assistive tech too, not just visually.
                aria-current={on ? "true" : undefined}
              >
                <Link
                  href={`/projects/${project.id}`}
                  className={`block h-full rounded-xl border p-5 transition-colors ${
                    on
                      ? "border-inverse bg-warn-soft ring-2 ring-warn"
                      : "border-line hover:border-inverse"
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-4 shrink-0 rounded-full"
                      style={{
                        backgroundColor: categoryVar(project.category),
                      }}
                    />
                    <span className="font-semibold">{project.name}</span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm text-ink-soft">
                    {project.description}
                  </p>
                  <div className="mt-3 text-sm tabular-nums text-ink-muted">
                    {t("city.openedOfTotal", {
                      opened: project.openedKm,
                      total: project.totalKm,
                      lots: project.lots,
                    })}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
