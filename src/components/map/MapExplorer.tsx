"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { currentMonth } from "@/lib/contract";
import {
  computeMaxMonth,
  computeMinMonth,
  fromMonthIndex,
  HARD_MIN_MONTH,
  parseSelectionParam,
  parseMonthParam,
  parseSpeedParam,
  parseViewParam,
  serializeMapParams,
  type CategoryStatusSelection,
  type MapView,
} from "@/lib/map-filters";
import { visibleLots, type LotEntry } from "@/lib/lot-list";
import { newlyOpenedFilter, openedBetween } from "@/lib/map-delta";
import {
  baselineMonth as resolveBaseline,
  readCompareBaseline,
  type CompareBaseline,
} from "@/lib/compare-years";
import { formatKm } from "@/lib/format";
import {
  DEFAULT_BASEMAP_ID,
  basemapUrl,
  parseBasemapParam,
} from "@/lib/basemaps";
import { geometryBounds, type BBox } from "@/lib/geo";
import { DEFAULT_SPEED_INDEX, SPEED_STEPS } from "@/lib/playback";
import { useMapArtifacts } from "./useMapArtifacts";
import { useMapSelection } from "./useMapSelection";
import InfraMap, { DEFAULT_VIEW } from "./InfraMap";
import TimeSlider from "./TimeSlider";
import CategoryToggle from "./CategoryToggle";
import MapLegend from "./MapLegend";
import LotSearchPanel from "./LotSearchPanel";
import ChangePanel from "./ChangePanel";
import CompareMap from "./CompareMap";
import BasemapToggle from "./BasemapToggle";
import ProjectPanel from "./ProjectPanel";
import CountryPanel from "./CountryPanel";
import CityPanel from "./CityPanel";

export default function MapExplorer({
  locale,
  fillParent = false,
}: {
  locale: string;
  /**
   * Fill the container instead of the viewport minus the site header. Set
   * by the embed route, where there is no header to subtract.
   */
  fillParent?: boolean;
}) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  // The timeline steps whole months and always lands on the 1st. Read once,
  // through the same UTC helper as the server pages, so the map and the
  // panels beside it cannot straddle a month boundary.
  const [nowMonth] = useState(() => currentMonth());
  // Generous URL-parse ceiling; the slider's actual max follows the data.
  const maxMonthParam = nowMonth + 15 * 12;

  const [month, setMonth] = useState(() =>
    parseMonthParam(
      searchParams.get("t"),
      HARD_MIN_MONTH,
      maxMonthParam,
      nowMonth,
    ),
  );
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(() =>
    parseSpeedParam(
      searchParams.get("speed"),
      SPEED_STEPS.length,
      DEFAULT_SPEED_INDEX,
    ),
  );
  const [selection, setSelection] = useState<CategoryStatusSelection>(() =>
    parseSelectionParam(searchParams.get("cat"), searchParams.get("st")),
  );
  // The camera is read once. react-map-gl only looks at initialViewState on
  // mount, and every later move comes back through onViewChange.
  const [initialView] = useState(() => parseViewParam(searchParams.get("v")));
  const [view, setView] = useState<MapView | null>(initialView);
  /** Camera target for a search hit; the nonce is what re-fires it. */
  const [focus, setFocus] = useState<{ bbox: BBox; nonce: number } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [basemapId, setBasemapId] = useState(
    () => parseBasemapParam(searchParams.get("bm")) ?? DEFAULT_BASEMAP_ID,
  );
  /**
   * The far side of the change readout and of the before/after wipe. One
   * control drives both, so the number in the panel is the year on the left
   * of the handle.
   *
   * Either an offset that follows the slider, or a month the reader set on
   * the left timeline and that must stay put. `cmp` is read against the month in
   * the same link: read against today instead, a link to a past date
   * reopened on a baseline nobody chose.
   */
  const [baseline, setBaseline] = useState<CompareBaseline>(() => {
    const raw = searchParams.get("cmp");
    if (!raw) return { years: 5, pinned: null };
    const from = parseMonthParam(raw, HARD_MIN_MONTH, maxMonthParam, -1);
    if (from === -1) return { years: 5, pinned: null };
    const at = parseMonthParam(
      searchParams.get("t"),
      HARD_MIN_MONTH,
      maxMonthParam,
      nowMonth,
    );
    return readCompareBaseline(from, at, 5);
  });
  const beforeMonth = resolveBaseline(month, baseline);
  const [highlightNew, setHighlightNew] = useState(false);
  // Both only read below `sm`, where the overlays are disclosures and the
  // screen fits one at a time.
  const [controlsOpen, setControlsOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [comparing, setComparing] = useState(
    () => searchParams.get("cmp") !== null,
  );

  const artifacts = useMapArtifacts();
  const { geojson, countryOutlines, cityMarkers } = artifacts.data;

  // One lot, one country or one city, never two at once, plus the part of
  // a shared link that cannot be read until the data is here. The hook
  // reads the parameters at mount: the URL-sync effect below rewrites the
  // query string before the load finishes, which would otherwise drop them.
  const {
    selected,
    selectedCountry,
    selectedCity,
    selectedProject,
    selectedLot,
    selectedCountryStats,
    selectedCountryGrowth,
    selectedCityRef,
    selectedCityMarker,
    handleSelectLot,
    handleSelectCountry,
    handleSelectCity,
    setSelected,
    setSelectedCountry,
    setSelectedCity,
  } = useMapSelection(
    {
      sel: searchParams.get("sel"),
      city: searchParams.get("city"),
      c: searchParams.get("c"),
    },
    artifacts,
    { month, nowMonth },
  );

  // Keep the URL shareable without triggering Next.js navigation.
  useEffect(() => {
    const qs = serializeMapParams({
      month,
      selection,
      selectedLot: selected
        ? { projectId: selected.projectId, lotId: selected.lotId }
        : null,
      selectedCountry,
      selectedCity,
      defaultMonth: nowMonth,
      speedIndex,
      defaultSpeedIndex: DEFAULT_SPEED_INDEX,
      view,
      defaultView: DEFAULT_VIEW,
      basemap: basemapId === DEFAULT_BASEMAP_ID ? null : basemapId,
      compareFrom: comparing ? beforeMonth : null,
    });
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
  }, [
    month,
    selection,
    selected,
    selectedCountry,
    selectedCity,
    nowMonth,
    speedIndex,
    view,
    basemapId,
    comparing,
    beforeMonth,
  ]);

  useEffect(() => {
    const timer = copyTimer;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Slider bounds follow the data (bridges from 1895; expected openings).
  const minMonth = useMemo(() => computeMinMonth(geojson.features), [geojson]);
  const maxMonth = useMemo(
    () => computeMaxMonth(geojson.features, nowMonth),
    [geojson, nowMonth],
  );

  const handleMonthChange = useCallback((m: number) => setMonth(m), []);

  /**
   * A preset returns the baseline to following the slider; dragging the left
   * timeline names a month, and naming one has to survive scrubbing.
   */
  const handleBaselineYears = useCallback(
    (years: number) => setBaseline({ years, pinned: null }),
    [],
  );
  const handleBeforeMonthChange = useCallback(
    (m: number) => setBaseline((b) => ({ ...b, pinned: m })),
    [],
  );

  const handleViewChange = useCallback((next: MapView) => setView(next), []);

  /** Everything the map is drawing now, as a list the keyboard can reach. */
  const listedLots = useMemo(
    () => visibleLots(geojson.features, selection, month, nowMonth),
    [geojson, selection, month, nowMonth],
  );

  /**
   * Every lot regardless of month, which is what the change readout needs:
   * it compares two months and so cannot start from one month's view.
   */
  const allLots = useMemo(
    () =>
      geojson.features
        .map((f) => f.properties as unknown as LotEntry | null)
        .filter((p): p is LotEntry => !!p?.lotId && p.marker !== true),
    [geojson],
  );

  /**
   * The one line that names both years and what lies between them. It sits
   * in the time slider card: as a pill of its own at the bottom of the map
   * it was drawn underneath that card and never seen. Only computed while
   * comparing: it depends on the month, so playback would otherwise walk
   * every lot on each tick for a line nobody sees.
   */
  const compareSummary = useMemo(
    () =>
      comparing
        ? t("map.compareSummary", {
            km: formatKm(
              openedBetween(allLots, {
                from: beforeMonth,
                to: month,
                nowMonth,
              }).km,
              locale,
            ),
            before: String(fromMonthIndex(beforeMonth).year),
            after: String(fromMonthIndex(month).year),
          })
        : undefined,
    [comparing, t, allLots, beforeMonth, month, nowMonth, locale],
  );

  const newlyOpened = useMemo(
    () =>
      highlightNew
        ? newlyOpenedFilter({ from: beforeMonth, to: month, nowMonth })
        : null,
    [highlightNew, month, beforeMonth, nowMonth],
  );

  /**
   * Picking a lot from the list selects it and flies to it. The bounds come
   * from the feature already in memory, so no geocoder is involved.
   */
  const handleSelectFromList = useCallback(
    (lot: LotEntry) => {
      handleSelectLot(lot);
      // The project panel covers a phone screen whole. Leaving the filter
      // stack open behind it means closing two things to get back to the map.
      setControlsOpen(false);
      let bbox: BBox | null = null;
      for (const feature of geojson.features) {
        const props = feature.properties;
        if (props?.lotId !== lot.lotId || props?.projectId !== lot.projectId) {
          continue;
        }
        const bounds = geometryBounds(feature.geometry);
        if (!bounds) continue;
        bbox = bbox
          ? [
              Math.min(bbox[0], bounds[0]),
              Math.min(bbox[1], bounds[1]),
              Math.max(bbox[2], bounds[2]),
              Math.max(bbox[3], bounds[3]),
            ]
          : bounds;
      }
      // A counter, not a timestamp: picking the same lot twice in one
      // millisecond still has to move the camera back to it.
      if (bbox) {
        const box = bbox;
        setFocus((prev) => ({ bbox: box, nonce: (prev?.nonce ?? 0) + 1 }));
      }
    },
    [geojson, handleSelectLot],
  );

  const handleCopyLink = useCallback(() => {
    // The URL is rewritten silently by replaceState, so nothing until now
    // told anyone the view was shareable at all.
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        setCopied(true);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(console.error);
  }, []);

  return (
    // dvh, not vh: on mobile browsers vh is the *large* viewport height, so
    // the map ran taller than the visible area and put the time slider under
    // the collapsing URL bar.
    <div
      // Marks the page as one the map owns end to end, which globals.css
      // reads to stop the sticky header sliding over the map's controls.
      data-fullbleed-map={fillParent ? undefined : ""}
      className={
        fillParent ? "relative h-full" : "relative h-[calc(100dvh-3.5rem)]"
      }
    >
      {comparing ? (
        <CompareMap
          geojson={geojson}
          beforeMonth={beforeMonth}
          afterMonth={month}
          nowMonth={nowMonth}
          selection={selection}
          locale={locale}
          basemapId={basemapId}
          initialView={view ?? initialView ?? DEFAULT_VIEW}
        />
      ) : (
        <InfraMap
          geojson={geojson}
          countries={countryOutlines}
          cities={cityMarkers}
          month={month}
          nowMonth={nowMonth}
          selection={selection}
          selectedLotId={selected?.lotId ?? null}
          selectedCountry={selectedCountry}
          selectedCity={selectedCity}
          onSelectLot={handleSelectLot}
          onSelectCountry={handleSelectCountry}
          onSelectCity={handleSelectCity}
          locale={locale}
          initialView={initialView}
          onViewChange={handleViewChange}
          focus={focus}
          newlyOpened={newlyOpened}
          mapStyle={basemapUrl(basemapId)}
        />
      )}

      {/* A cold load used to show a bare basemap with no explanation. */}
      {artifacts.loading && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
          <div className="rounded-full border border-line bg-surface/95 px-4 py-2 text-sm text-ink-soft shadow backdrop-blur">
            {t("map.loading")}
          </div>
        </div>
      )}

      {artifacts.error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/70 p-4 backdrop-blur-xs">
          <div
            role="alert"
            className="max-w-sm rounded-xl border border-line bg-surface px-5 py-4 text-center shadow-lg"
          >
            <p className="text-sm font-medium text-ink">{t("map.loadError")}</p>
            <p className="mt-1 text-xs break-words text-ink-muted">
              {artifacts.error}
            </p>
            <button
              type="button"
              onClick={artifacts.retry}
              className="mt-4 cursor-pointer rounded-lg bg-inverse px-3 py-1.5 text-sm font-medium text-on-inverse hover:bg-inverse-soft"
            >
              {t("map.loadRetry")}
            </button>
          </div>
        </div>
      )}

      {/* top-left: category filters, then the searchable list of what is
          drawn. The list is the only route to a road without a mouse.

          Below `sm` the whole stack hides behind one button, as the legend
          does. Three cards 288px wide on a 393px screen left the map a
          margin to look at, and they ran under the buttons on the right. */}
      <div className="absolute top-4 right-16 left-4 z-10 flex max-h-[calc(100%-13rem)] flex-col gap-2 sm:right-auto sm:max-h-[calc(100%-2rem)]">
        <button
          type="button"
          onClick={() => setControlsOpen((v) => !v)}
          aria-expanded={controlsOpen}
          aria-controls="map-controls"
          className="inline-flex w-max cursor-pointer items-center rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs font-medium text-ink-soft shadow backdrop-blur pointer-coarse:min-h-11 sm:hidden"
        >
          {controlsOpen ? t("map.hideFilters") : t("map.showFilters")}
        </button>
        <div
          id="map-controls"
          className={`${
            controlsOpen ? "flex" : "hidden"
          } min-h-0 flex-col gap-2 sm:flex`}
        >
          <CategoryToggle selection={selection} onChange={setSelection} />
          <div className="min-h-0 overflow-y-auto">
            {/* No point listing what is on the map while the wipe is showing
              two maps; the baseline control below stays, one press away,
              because it is what sets the year on the left of the handle. */}
            {!comparing && (
              <LotSearchPanel
                lots={listedLots}
                selectedLotId={selected?.lotId ?? null}
                onSelect={handleSelectFromList}
                locale={locale}
              />
            )}
            <div className="mt-2">
              <ChangePanel
                lots={allLots}
                month={month}
                nowMonth={nowMonth}
                baselineMonth={beforeMonth}
                onBaselineYearsChange={handleBaselineYears}
                highlight={highlightNew}
                onHighlightChange={setHighlightNew}
                onSelect={handleSelectFromList}
                locale={locale}
              />
            </div>
          </div>
        </div>
      </div>

      {/* top-right, clear of MapLibre's own controls. The two buttons stack
          below `sm`: side by side they are wider than the half of a phone
          screen left over once the filters button has its share. And they
          stand down entirely while the filters are open, because one overlay
          at a time is the only way three cards and three buttons fit on a
          393px screen without landing on each other. */}
      <div
        className={`absolute top-4 right-4 z-10 mr-11 ${
          controlsOpen ? "hidden" : "flex"
        } flex-col items-end gap-2 sm:flex`}
      >
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-stretch">
          <button
            type="button"
            onClick={() => setComparing((v) => !v)}
            aria-pressed={comparing}
            className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-xs font-medium shadow backdrop-blur pointer-coarse:min-h-11 ${
              comparing
                ? "border-inverse bg-inverse text-on-inverse"
                : "border-line bg-surface/95 text-ink-soft hover:border-inverse hover:text-ink"
            }`}
          >
            {t("map.compareToggle")}
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex cursor-pointer items-center rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs font-medium text-ink-soft shadow backdrop-blur pointer-coarse:min-h-11 hover:border-inverse hover:text-ink"
          >
            {copied ? t("map.linkCopied") : t("map.copyLink")}
          </button>
        </div>
        <BasemapToggle value={basemapId} onChange={setBasemapId} />
      </div>

      {/* bottom-center: time slider. Lifted clear of the legend button and
          the basemap attribution on a phone, where all three landed on the
          same 40px of screen, and it stands down entirely while the legend
          is open: the open legend is taller than the gap above it. */}
      <div
        className={`absolute bottom-20 left-4 right-4 z-10 ${
          legendOpen ? "hidden" : "flex"
        } justify-center sm:bottom-6 sm:left-1/2 sm:right-auto sm:block sm:-translate-x-1/2`}
      >
        <TimeSlider
          note={comparing ? compareSummary : undefined}
          compare={
            comparing
              ? {
                  beforeMonth,
                  onBeforeMonthChange: handleBeforeMonthChange,
                }
              : null
          }
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

      {/* bottom-left: legend. Reachable on a phone now, where category used
          to be hue with nothing to read it against. */}
      <div className="absolute bottom-10 left-4 z-10 sm:bottom-6">
        <MapLegend
          showDerivedNote
          open={legendOpen}
          onOpenChange={setLegendOpen}
        />
      </div>

      {/* right: selected lot panel */}
      {selected && selectedProject && selectedLot && (
        <ProjectPanel
          project={selectedProject}
          lot={selectedLot}
          onClose={() => setSelected(null)}
        />
      )}

      {/* right: selected country panel (never two at once — see the
          handleSelect* callbacks, which clear the other two) */}
      {selectedCountryStats && (
        <CountryPanel
          country={selectedCountryStats}
          growth={selectedCountryGrowth}
          month={month}
          onClose={() => setSelectedCountry(null)}
        />
      )}

      {/* right: selected city panel */}
      {selectedCity && selectedCityRef && (
        <CityPanel
          cityKey={selectedCity}
          city={selectedCityRef}
          marker={selectedCityMarker}
          onClose={() => setSelectedCity(null)}
        />
      )}
    </div>
  );
}
