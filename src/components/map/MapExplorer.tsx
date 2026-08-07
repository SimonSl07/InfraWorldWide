"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { FeatureCollection } from "geojson";
import type { Category, Project } from "@/lib/schema";
import { ALL_CATEGORIES, MAP_STATUSES } from "@/lib/map-style";
import {
  computeMaxYear,
  computeMinYear,
  HARD_MIN_YEAR,
  parseCategoriesParam,
  parseYearParam,
  serializeMapParams,
} from "@/lib/map-filters";
import {
  DEFAULT_SPEED_INDEX,
  SPEED_STEPS,
} from "@/lib/playback";
import InfraMap, { type LotFeatureProps } from "./InfraMap";
import TimeSlider from "./TimeSlider";
import CategoryToggle from "./CategoryToggle";
import ProjectPanel from "./ProjectPanel";

/** Legend line samples, matching the map's line styles. */
const LEGEND_SVG: Record<string, { dash?: string; opacity?: number }> = {
  opened: {},
  under_construction: { dash: "8 6" },
  tendered: { dash: "2 5", opacity: 0.7 },
  planned: { dash: "2 5", opacity: 0.7 },
};

function LegendLine({ status }: { status: string }) {
  const s = LEGEND_SVG[status] ?? {};
  return (
    <svg width="30" height="6" aria-hidden="true">
      <line
        x1="1"
        y1="3"
        x2="29"
        y2="3"
        stroke="#262626"
        strokeWidth="3.5"
        strokeLinecap="butt"
        strokeDasharray={s.dash}
        opacity={s.opacity ?? 1}
      />
    </svg>
  );
}

export default function MapExplorer() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const nowYear = new Date().getFullYear();
  // Generous URL-parse ceiling; the slider's actual max follows the data.
  const maxYearParam = nowYear + 15;

  const [year, setYear] = useState(() =>
    parseYearParam(searchParams.get("year"), HARD_MIN_YEAR, maxYearParam, nowYear),
  );
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(() => {
    const raw = Number(searchParams.get("speed"));
    return Number.isInteger(raw) && raw >= 0 && raw < SPEED_STEPS.length
      ? raw
      : DEFAULT_SPEED_INDEX;
  });
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(() =>
    parseCategoriesParam(searchParams.get("cat")),
  );
  const [selected, setSelected] = useState<LotFeatureProps | null>(null);
  // Captured at mount: the URL-sync effect below rewrites the query string
  // before the async data load finishes, which would otherwise drop ?sel=.
  const [initialSelId] = useState(() => searchParams.get("sel"));

  const [geojson, setGeojson] = useState<FeatureCollection>({
    type: "FeatureCollection",
    features: [],
  });
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const manifest = (await fetch("/data/geo/manifest.json").then((r) =>
        r.json(),
      )) as { countries: string[] };
      const collections = (await Promise.all(
        manifest.countries.map((c) =>
          fetch(`/data/geo/${c}.geojson`).then((r) => r.json()),
        ),
      )) as FeatureCollection[];
      const idx = (await fetch("/data/projects.json").then((r) =>
        r.json(),
      )) as { projects: Project[] };
      if (cancelled) return;
      const merged: FeatureCollection = {
        type: "FeatureCollection",
        features: collections.flatMap((c) => c.features),
      };
      setGeojson(merged);
      setProjects(idx.projects);

      // Restore a shared ?sel= link once geometry is available.
      if (initialSelId) {
        const feature = merged.features.find(
          (f) => f.properties?.lotId === initialSelId,
        );
        if (feature?.properties) {
          setSelected(feature.properties as unknown as LotFeatureProps);
        }
      }
    }
    load().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [initialSelId]);

  // Keep the URL shareable without triggering Next.js navigation.
  useEffect(() => {
    const qs = serializeMapParams(
      year,
      activeCategories,
      selected?.lotId ?? null,
      nowYear,
      speedIndex,
      DEFAULT_SPEED_INDEX,
    );
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
  }, [year, activeCategories, selected, nowYear, speedIndex]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selected?.projectId),
    [projects, selected],
  );

  // Slider bounds follow the data (bridges from 1895; expected openings).
  const minYear = useMemo(() => computeMinYear(geojson.features), [geojson]);
  const maxYear = useMemo(
    () => computeMaxYear(geojson.features, nowYear),
    [geojson, nowYear],
  );  const selectedLot = useMemo(
    () => selectedProject?.lots.find((l) => l.id === selected?.lotId),
    [selectedProject, selected],
  );

  const handleYearChange = useCallback((y: number) => setYear(y), []);

  return (
    <div className="relative h-[calc(100vh-3.5rem)]">
      <InfraMap
        geojson={geojson}
        year={year}
        activeCategories={activeCategories}
        selectedLotId={selected?.lotId ?? null}
        onSelectLot={setSelected}
      />

      {/* top-left: category filters */}
      <div className="absolute top-4 left-4 z-10">
        <CategoryToggle active={activeCategories} onChange={setActiveCategories} />
      </div>

      {/* bottom-center: time slider */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <TimeSlider
          year={year}
          min={minYear}
          max={maxYear}
          playing={playing}
          speedIndex={speedIndex}
          onYearChange={handleYearChange}
          onPlayingChange={setPlaying}
          onSpeedIndexChange={setSpeedIndex}
        />
      </div>

      {/* bottom-left: legend */}
      <div className="absolute bottom-6 left-4 z-10 hidden sm:block bg-white/95 backdrop-blur rounded-xl shadow border border-neutral-200 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase text-neutral-400 mb-1">
          {t("map.legend")}
        </div>
        {MAP_STATUSES.map((s) => (
          <div key={s} className="flex items-center gap-2 text-xs text-neutral-600">
            <LegendLine status={s} />
            {t(`status.${s}`)}
          </div>
        ))}
      </div>

      {/* right: selected lot panel */}
      {selected && selectedProject && selectedLot && (
        <ProjectPanel
          project={selectedProject}
          lot={selectedLot}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
