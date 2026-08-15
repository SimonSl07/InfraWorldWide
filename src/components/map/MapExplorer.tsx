"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { FeatureCollection } from "geojson";
import type { Project } from "@/lib/schema";
import { fetchJson } from "@/lib/fetch-json";
import {
  computeMaxMonth,
  computeMinMonth,
  HARD_MIN_MONTH,
  parseCityParam,
  parseCountryParam,
  parseLotRef,
  parseSelectionParam,
  parseMonthParam,
  parseViewParam,
  resolveLotRef,
  serializeMapParams,
  toMonthIndex,
  type CategoryStatusSelection,
  type MapView,
} from "@/lib/map-filters";
import { visibleLots, type LotEntry } from "@/lib/lot-list";
import { newlyOpenedFilter } from "@/lib/map-delta";
import {
  DEFAULT_BASEMAP_ID,
  basemapUrl,
  parseBasemapParam,
} from "@/lib/basemaps";
import { geometryBounds, type BBox } from "@/lib/geo";
import {
  DEFAULT_SPEED_INDEX,
  SPEED_STEPS,
} from "@/lib/playback";
import { rankCountries, findCountry } from "@/lib/country-stats";
import { openedKmByDecade } from "@/lib/country-growth";
import type { CityTable, CountryTable } from "@/lib/schema";
import InfraMap, {
  DEFAULT_VIEW,
  type CityMarkerProps,
  type LotFeatureProps,
} from "./InfraMap";
import TimeSlider from "./TimeSlider";
import CategoryToggle from "./CategoryToggle";
import MapLegend from "./MapLegend";
import LotSearchPanel from "./LotSearchPanel";
import ChangePanel, { BASELINE_YEARS } from "./ChangePanel";
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
  const [selectedCountry, setSelectedCountry] = useState<string | null>(() =>
    parseCountryParam(searchParams.get("c")),
  );
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  // Captured at mount: the URL-sync effect below rewrites the query string
  // before the async data load finishes, which would otherwise drop these.
  const [initialSelRef] = useState(() => parseLotRef(searchParams.get("sel")));
  const [initialCity] = useState(() => searchParams.get("city"));
  // The camera is read once. react-map-gl only looks at initialViewState on
  // mount, and every later move comes back through onViewChange.
  const [initialView] = useState(() => parseViewParam(searchParams.get("v")));
  const [view, setView] = useState<MapView | null>(initialView);
  /** Camera target for a search hit; the nonce is what re-fires it. */
  const [focus, setFocus] = useState<{ bbox: BBox; nonce: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [basemapId, setBasemapId] = useState(
    () => parseBasemapParam(searchParams.get("bm")) ?? DEFAULT_BASEMAP_ID,
  );
  /**
   * Years back from the viewed month that the change readout compares to,
   * and the baseline the before/after wipe uses. One control drives both,
   * so the number in the panel is the year on the left of the handle.
   */
  const [baselineYears, setBaselineYears] = useState<number>(() => {
    const raw = searchParams.get("cmp");
    if (!raw) return 5;
    const from = parseMonthParam(raw, HARD_MIN_MONTH, maxMonthParam, -1);
    if (from === -1) return 5;
    const years = Math.round((nowMonth - from) / 12);
    return BASELINE_YEARS.reduce((best, y) =>
      Math.abs(y - years) < Math.abs(best - years) ? y : best,
    );
  });
  const [highlightNew, setHighlightNew] = useState(false);
  const [comparing, setComparing] = useState(
    () => searchParams.get("cmp") !== null,
  );

  const [geojson, setGeojson] = useState<FeatureCollection>({
    type: "FeatureCollection",
    features: [],
  });
  const [countryOutlines, setCountryOutlines] = useState<FeatureCollection>({
    type: "FeatureCollection",
    features: [],
  });
  const [cityMarkers, setCityMarkers] = useState<FeatureCollection>({
    type: "FeatureCollection",
    features: [],
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [countryTable, setCountryTable] = useState<CountryTable | null>(null);
  const [cityTable, setCityTable] = useState<CityTable | null>(null);
  /** Bumped by the retry button to re-run the load effect. */
  const [reloadKey, setReloadKey] = useState(0);
  // Tagged with the attempt it belongs to, so pressing retry puts the view
  // back into its loading state without touching state during render.
  const [outcome, setOutcome] = useState<{
    key: number;
    error: string | null;
  } | null>(null);
  const settled = outcome && outcome.key === reloadKey ? outcome : null;
  const loading = settled === null;
  const loadError = settled?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // The manifest names the country files, so it has to land first.
      const manifest = await fetchJson<{ countries: string[] }>(
        "/data/geo/manifest.json",
      );
      // Everything below is independent of everything else: awaiting them
      // in turn cost one round trip each for no reason.
      const [collections, idx, outlines, table, cityPoints, cityRefs] =
        await Promise.all([
          Promise.all(
            manifest.countries.map((c) =>
              fetchJson<FeatureCollection>(`/data/geo/${c}.geojson`),
            ),
          ),
          fetchJson<{ projects: Project[] }>("/data/projects.json"),
          fetchJson<FeatureCollection>("/data/geo/countries.geojson"),
          fetchJson<CountryTable>("/data/countries.json"),
          fetchJson<FeatureCollection>("/data/geo/cities.geojson"),
          fetchJson<CityTable>("/data/cities.json"),
        ]);
      if (cancelled) return;
      const merged: FeatureCollection = {
        type: "FeatureCollection",
        features: collections.flatMap((c) => c.features),
      };
      setGeojson(merged);
      setProjects(idx.projects);
      setCountryOutlines(outlines);
      setCountryTable(table);
      setCityMarkers(cityPoints);
      setCityTable(cityRefs);

      // A ?c= code that is not in the data has nothing to select: the panel
      // would never mount, so there would be no × to press, while every lot
      // on the map stayed dimmed against a country that isn't there. Drop it
      // now that we know which countries actually exist.
      setSelectedCountry((current) =>
        current &&
        !outlines.features.some((f) => f.properties?.country === current)
          ? null
          : current,
      );

      // Restore a shared ?city= link once the city table is available.
      const city = parseCityParam(initialCity, Object.keys(cityRefs.cities));
      if (city) setSelectedCity(city);

      // Restore a shared ?sel= link once geometry is available.
      if (initialSelRef) {
        const candidates = merged.features
          .map((f) => f.properties as unknown as LotFeatureProps | null)
          .filter((p): p is LotFeatureProps => !!p?.lotId && p.marker !== true);
        // Lot ids repeat across projects: three Danube crossings each own a
        // lot called "main-bridge". An unqualified id that names more than
        // one of them selects none, rather than silently the first.
        const hit = resolveLotRef(candidates, initialSelRef);
        if (hit) {
          setSelected(hit);
          // A link carrying both ?sel= and ?c= must not open both panels
          // into the same corner. The lot wins, as it does in the URL.
          setSelectedCountry(null);
          setSelectedCity(null);
        }
      }
    }
    load()
      .then(() => {
        if (!cancelled) setOutcome({ key: reloadKey, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // Without this the map used to sit on an empty basemap forever:
        // the only trace of a missing artifact was a console line.
        console.error(cause);
        setOutcome({
          key: reloadKey,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [initialSelRef, initialCity, reloadKey]);

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
      compareFrom: comparing ? month - baselineYears * 12 : null,
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
    baselineYears,
  ]);

  useEffect(() => {
    const timer = copyTimer;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selected?.projectId),
    [projects, selected],
  );

  // Recomputed as the timeline moves: the panel reports the map's state in
  // the viewed month, ranks included.
  const ranked = useMemo(
    () =>
      countryTable
        ? rankCountries(projects, countryTable.countries, month, nowMonth)
        : [],
    [projects, countryTable, month, nowMonth],
  );
  const selectedCountryStats = useMemo(
    () => (selectedCountry ? findCountry(ranked, selectedCountry) : null),
    [ranked, selectedCountry],
  );
  // Growth is history, not a function of the viewed month, so it is keyed
  // only on the country.
  const selectedCountryGrowth = useMemo(
    () =>
      selectedCountry ? openedKmByDecade(projects, selectedCountry) : [],
    [projects, selectedCountry],
  );

  // One selection at a time — all three panels occupy the same corner.
  const handleSelectLot = useCallback((props: LotFeatureProps | null) => {
    setSelected(props);
    if (props) {
      setSelectedCountry(null);
      setSelectedCity(null);
    }
  }, []);

  const handleSelectCountry = useCallback((code: string | null) => {
    setSelectedCountry(code);
    if (code) {
      setSelected(null);
      setSelectedCity(null);
    }
  }, []);

  const handleSelectCity = useCallback((key: string | null) => {
    setSelectedCity(key);
    if (key) {
      setSelected(null);
      setSelectedCountry(null);
    }
  }, []);

  const selectedCityRef = useMemo(
    () => (selectedCity ? cityTable?.cities[selectedCity] ?? null : null),
    [cityTable, selectedCity],
  );
  const selectedCityMarker = useMemo(() => {
    const feature = cityMarkers.features.find(
      (f) => f.properties?.city === selectedCity,
    );
    return (feature?.properties as unknown as CityMarkerProps) ?? null;
  }, [cityMarkers, selectedCity]);

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

  const newlyOpened = useMemo(
    () =>
      highlightNew
        ? newlyOpenedFilter({
            from: month - baselineYears * 12,
            to: month,
            nowMonth,
          })
        : null,
    [highlightNew, month, baselineYears, nowMonth],
  );

  /**
   * Picking a lot from the list selects it and flies to it. The bounds come
   * from the feature already in memory, so no geocoder is involved.
   */
  const handleSelectFromList = useCallback(
    (lot: LotEntry) => {
      handleSelectLot(lot);
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
      className={
        fillParent ? "relative h-full" : "relative h-[calc(100dvh-3.5rem)]"
      }
    >
      {comparing ? (
        <CompareMap
          geojson={geojson}
          beforeMonth={month - baselineYears * 12}
          afterMonth={month}
          nowMonth={nowMonth}
          selection={selection}
          locale={locale}
          basemapId={basemapId}
          initialView={view ?? initialView ?? DEFAULT_VIEW}
          lots={allLots}
        />
      ) : (
      <InfraMap
        geojson={geojson}
        countries={countryOutlines}
        cities={cityMarkers}
        month={month}
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
      {loading && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
          <div className="rounded-full border border-line bg-surface/95 px-4 py-2 text-sm text-ink-soft shadow backdrop-blur">
            {t("map.loading")}
          </div>
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/70 p-4 backdrop-blur-xs">
          <div
            role="alert"
            className="max-w-sm rounded-xl border border-line bg-surface px-5 py-4 text-center shadow-lg"
          >
            <p className="text-sm font-medium text-ink">
              {t("map.loadError")}
            </p>
            <p className="mt-1 text-xs break-words text-ink-muted">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-4 cursor-pointer rounded-lg bg-inverse px-3 py-1.5 text-sm font-medium text-on-inverse hover:bg-inverse-soft"
            >
              {t("map.loadRetry")}
            </button>
          </div>
        </div>
      )}

      {/* top-left: category filters, then the searchable list of what is
          drawn. The list is the only route to a road without a mouse. */}
      <div className="absolute top-4 left-4 z-10 flex max-h-[calc(100%-2rem)] flex-col gap-2">
        <CategoryToggle selection={selection} onChange={setSelection} />
        <div className="min-h-0 overflow-y-auto">
          {/* No point listing what is on the map while the wipe is showing
              two maps; the baseline control below stays, because it is what
              sets the year on the left of the handle. */}
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
              baselineYears={baselineYears}
              onBaselineYearsChange={setBaselineYears}
              highlight={highlightNew}
              onHighlightChange={setHighlightNew}
              onSelect={handleSelectFromList}
              locale={locale}
            />
          </div>
        </div>
      </div>

      {/* top-right, clear of MapLibre's own controls */}
      <div className="absolute top-4 right-4 z-10 mr-11 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setComparing((v) => !v)}
            aria-pressed={comparing}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium shadow backdrop-blur ${
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
            className="cursor-pointer rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs font-medium text-ink-soft shadow backdrop-blur hover:border-inverse hover:text-ink"
          >
            {copied ? t("map.linkCopied") : t("map.copyLink")}
          </button>
        </div>
        <BasemapToggle value={basemapId} onChange={setBasemapId} />
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

      {/* bottom-left: legend. Reachable on a phone now, where category used
          to be hue with nothing to read it against. */}
      <div className="absolute bottom-6 left-4 z-10">
        <MapLegend showDerivedNote />
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
