"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { FeatureCollection } from "geojson";
import type { Project } from "@/lib/schema";
import { MAP_STATUSES } from "@/lib/map-style";
import {
  computeMaxMonth,
  computeMinMonth,
  HARD_MIN_MONTH,
  parseSelectionParam,
  parseMonthParam,
  serializeMapParams,
  toMonthIndex,
  type CategoryStatusSelection,
} from "@/lib/map-filters";
import {
  DEFAULT_SPEED_INDEX,
  SPEED_STEPS,
} from "@/lib/playback";
import InfraMap, { type LotFeatureProps } from "./InfraMap";
import TimeSlider from "./TimeSlider";
import CategoryToggle from "./CategoryToggle";
import LegendLine from "./LegendLine";
import ProjectPanel from "./ProjectPanel";

export default function MapExplorer({ locale }: { locale: string }) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const now = new Date();
  // The timeline steps whole months and always lands on the 1st.
  const nowMonth = toMonthIndex(now.getFullYear(), now.getMonth() + 1);
  // Generous URL-parse ceiling; the slider's actual max follows the data.
  const maxMonthParam = nowMonth + 15 * 12;

  const [month, setMonth] = useState(() =>
    parseMonthParam(searchParams.get("t"), HARD_MIN_MONTH, maxMonthParam, nowMonth),
  );
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(() => {
    // Guard the null first: Number(null) is 0, which is a valid index, so
    // a missing ?speed= would silently select the slowest speed instead of
    // the default.
    const param = searchParams.get("speed");
    if (param === null) return DEFAULT_SPEED_INDEX;
    const raw = Number(param);
    return Number.isInteger(raw) && raw >= 0 && raw < SPEED_STEPS.length
      ? raw
      : DEFAULT_SPEED_INDEX;
  });
  const [selection, setSelection] = useState<CategoryStatusSelection>(() =>
    parseSelectionParam(searchParams.get("cat"), searchParams.get("st")),
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
      month,
      selection,
      selected?.lotId ?? null,
      nowMonth,
      speedIndex,
      DEFAULT_SPEED_INDEX,
    );
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
  }, [month, selection, selected, nowMonth, speedIndex]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selected?.projectId),
    [projects, selected],
  );

  // Slider bounds follow the data (bridges from 1895; expected openings).
  const minMonth = useMemo(() => computeMinMonth(geojson.features), [geojson]);
  const maxMonth = useMemo(
    () => computeMaxMonth(geojson.features, nowMonth),
    [geojson, nowMonth],
  );  const selectedLot = useMemo(
    () => selectedProject?.lots.find((l) => l.id === selected?.lotId),
    [selectedProject, selected],
  );

  const handleMonthChange = useCallback((m: number) => setMonth(m), []);

  return (
    <div className="relative h-[calc(100vh-3.5rem)]">
      <InfraMap
        geojson={geojson}
        month={month}
        selection={selection}
        selectedLotId={selected?.lotId ?? null}
        onSelectLot={setSelected}
      />

      {/* top-left: category filters */}
      <div className="absolute top-4 left-4 z-10">
        <CategoryToggle selection={selection} onChange={setSelection} />
      </div>

      {/* bottom-center: time slider */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <TimeSlider
          month={month}
          min={minMonth}
          max={maxMonth}
          playing={playing}
          locale={locale}
          speedIndex={speedIndex}
          onMonthChange={handleMonthChange}
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
