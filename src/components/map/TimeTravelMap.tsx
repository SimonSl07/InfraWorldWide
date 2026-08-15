"use client";

import { useMemo, useState } from "react";
import { Source, Layer } from "react-map-gl/maplibre";
import { useTranslations } from "next-intl";
import type { FeatureCollection } from "geojson";
import type {
  ExpressionSpecification,
  FilterSpecification,
} from "maplibre-gl";
import {
  buildMonthFilters,
  computeMaxMonth,
  computeMinMonth,
  fullSelection,
  shouldShowFuture,
  toMonthIndex,
} from "@/lib/map-filters";
import {
  ALL_CATEGORIES,
  MARKER_FILTER,
  categoryColorExpr,
  statusDashExpr,
} from "@/lib/map-style";
import { mapColorsFor } from "@/lib/map-theme";
import { usePrefersDark } from "./useColorScheme";
import { DEFAULT_SPEED_INDEX } from "@/lib/playback";
import MapLegend from "./MapLegend";
import StaticGeoMap, { type FallbackView } from "./StaticGeoMap";
import TimeSlider from "./TimeSlider";

/**
 * One GeoJSON artifact, played back month by month.
 *
 * The time slider used to exist on the main map alone, so every country and
 * city page showed the network as it stands today and nothing of how it got
 * there. This is the same idea in a frame small enough to drop into a page:
 * the artifact, its own slider, and no panels, list or search.
 *
 * Everything about the frame itself comes from StaticGeoMap. What is added
 * here is the month state and the layers that answer to it.
 */

/* ── Width ramps ──────────────────────────────────────────────────────── */

/**
 * The stops span country zoom and city zoom, because the same component
 * draws both. Cast because outside a paint literal TypeScript widens the
 * tuple and stops recognising the expression.
 *
 * One zoom interpolation per property and nothing wrapped around it: a
 * "case" or "match" on the outside type-checks and makes MapLibre drop the
 * whole layer with no error. Per-status variation therefore lives in
 * `line-dasharray`, which carries no zoom term.
 */
const CASING_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  3.5,
  9,
  5,
  14,
  11,
] as unknown as ExpressionSpecification;

const OPENED_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  2,
  9,
  3,
  14,
  8,
] as unknown as ExpressionSpecification;

const BUILDING_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  1.8,
  9,
  2.5,
  14,
  6.5,
] as unknown as ExpressionSpecification;

const FUTURE_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  1.5,
  9,
  2,
  14,
  6,
] as unknown as ExpressionSpecification;

/** Dash for a section being built, matching the main map's vocabulary. */
const BUILDING_DASH = [
  "literal",
  [3, 2.2],
] as unknown as ExpressionSpecification;

const POINT_RADIUS = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  3,
  9,
  4.5,
  14,
  8,
] as unknown as ExpressionSpecification;

/* ── Props ────────────────────────────────────────────────────────────── */

export interface TimeTravelMapProps {
  /** Any emitted FeatureCollection: a city, a country, a single project. */
  url: string;
  /** UI locale, for the month label and MapLibre's own strings. */
  locale: string;
  /** Tailwind height for the frame. */
  heightClass?: string;
  /** fitBounds padding in px. */
  padding?: number;
  /** Camera used until the geometry arrives. */
  fallback: FallbackView;
  scrollZoom?: boolean;
  /** A key for the categories the artifact contains. Off by default: on a
   * frame this small the slider is the thing to look at. */
  showLegend?: boolean;
}

export default function TimeTravelMap({
  url,
  locale,
  heightClass = "h-96",
  padding = 40,
  fallback,
  scrollZoom = false,
  showLegend = false,
}: TimeTravelMapProps) {
  const t = useTranslations("map");

  // Read once: "now" must not drift between renders, or the filters and the
  // slider bounds would disagree the moment a month ticks over.
  const [nowMonth] = useState(() => {
    const now = new Date();
    return toMonthIndex(now.getFullYear(), now.getMonth() + 1);
  });

  // The playback state lives here, above the frame, so the map remounting on
  // its fitted bounds does not throw the viewer back to the present.
  const [month, setMonth] = useState(nowMonth);
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX);

  return (
    <section aria-label={t("timeTravel")}>
      <StaticGeoMap
        url={url}
        heightClass={heightClass}
        padding={padding}
        fallback={fallback}
        scrollZoom={scrollZoom}
      >
        {(data) => (
          <TimeTravelScene
            data={data}
            month={month}
            nowMonth={nowMonth}
            playing={playing}
            speedIndex={speedIndex}
            locale={locale}
            showLegend={showLegend}
            onMonthChange={setMonth}
            onPlayingChange={setPlaying}
            onSpeedIndexChange={setSpeedIndex}
          />
        )}
      </StaticGeoMap>
    </section>
  );
}

/* ── Layers and slider ────────────────────────────────────────────────── */

interface TimeTravelSceneProps {
  data: FeatureCollection;
  month: number;
  nowMonth: number;
  playing: boolean;
  speedIndex: number;
  locale: string;
  showLegend: boolean;
  onMonthChange: (month: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedIndexChange: (index: number) => void;
}

/**
 * Mounted inside the map, and only once the artifact is there. The slider
 * lives here rather than beside the frame because its bounds are read off
 * the data: a network that opened in 1979 and one projected to 2031 each get
 * a range that fits, with no year hardcoded anywhere.
 */
function TimeTravelScene({
  data,
  month,
  nowMonth,
  playing,
  speedIndex,
  locale,
  showLegend,
  onMonthChange,
  onPlayingChange,
  onSpeedIndexChange,
}: TimeTravelSceneProps) {
  // No category filtering here: the frame has no toggle to change it with.
  const selection = useMemo(() => fullSelection(), []);

  const filters = useMemo(
    () => buildMonthFilters(month, selection, nowMonth),
    [month, selection, nowMonth],
  );
  const showFuture = shouldShowFuture(month, nowMonth);

  const minMonth = useMemo(() => computeMinMonth(data.features), [data.features]);
  const maxMonth = useMemo(
    () => computeMaxMonth(data.features, nowMonth),
    [data.features, nowMonth],
  );

  // Bridges and tunnels are a few pixels of line; the build gives each one a
  // midpoint marker so it survives at this scale.
  const markerFilters = useMemo(() => {
    const wrap = (f: FilterSpecification) =>
      ["all", f, MARKER_FILTER] as unknown as FilterSpecification;
    return {
      opened: wrap(filters.opened),
      underConstruction: wrap(filters.underConstruction),
      future: wrap(filters.future),
    };
  }, [filters]);

  // Built once: playback re-renders this several times a second, and a fresh
  // object literal each time makes react-map-gl diff every layer again.
  // MapLibre paint values cannot read a CSS custom property, so the canvas
  // is told which palette to draw with.
  const prefersDark = usePrefersDark();
  const theme = useMemo(() => mapColorsFor(prefersDark), [prefersDark]);

  const paints = useMemo(() => {
    const color = categoryColorExpr(undefined, theme.category);
    const circle = {
      "circle-color": color,
      "circle-radius": POINT_RADIUS,
      "circle-stroke-color": theme.markerStroke,
      "circle-stroke-width": 1.5,
    };
    return {
      casing: {
        "line-color": theme.casing,
        "line-width": CASING_WIDTH,
        "line-opacity": 0.8,
      },
      opened: {
        "line-color": color,
        "line-width": OPENED_WIDTH,
        "line-opacity": 0.95,
      },
      // Dashed by the same vocabulary as the main map, so a section being
      // built reads the same here as it does there.
      underConstruction: {
        "line-color": color,
        "line-width": BUILDING_WIDTH,
        // Wrapped in "literal": line-dasharray is data-driven in MapLibre 5,
        // so a bare array there is read as an expression whose operator is
        // the number 3 and the layer is dropped.
        "line-dasharray": BUILDING_DASH,
        "line-opacity": 1,
      },
      // This layer is the one place a lot's declared status is the status
      // being drawn, so it is the one place the shared dash ramp applies.
      future: {
        "line-color": color,
        "line-width": FUTURE_WIDTH,
        "line-dasharray": statusDashExpr(),
        "line-opacity": 0.55,
      },
      pointsOpened: { ...circle, "circle-opacity": 0.95 },
      pointsUnderConstruction: { ...circle, "circle-opacity": 0.7 },
      pointsFuture: { ...circle, "circle-opacity": 0.4 },
    };
  }, [theme]);

  // A key listing tunnels for a metro artifact that has none is noise.
  const categories = useMemo(
    () =>
      ALL_CATEGORIES.filter((category) =>
        data.features.some((f) => f.properties?.category === category),
      ),
    [data.features],
  );

  return (
    <>
      <Source id="timetravel-lots" type="geojson" data={data}>
        {/* White casing under the open lines, for legibility over the
            basemap. */}
        <Layer
          id="timetravel-casing"
          type="line"
          filter={filters.opened}
          paint={paints.casing}
          layout={{ "line-cap": "round" }}
        />
        <Layer
          id="timetravel-opened"
          type="line"
          filter={filters.opened}
          paint={paints.opened}
          layout={{ "line-cap": "round" }}
        />
        <Layer
          id="timetravel-under-construction"
          type="line"
          filter={filters.underConstruction}
          paint={paints.underConstruction}
          layout={{ "line-cap": "butt" }}
        />
        {/* Nothing is "not yet started" in 1998: in the past the map shows
            what was there, not what is coming. */}
        {showFuture && (
          <Layer
            id="timetravel-future"
            type="line"
            filter={filters.future}
            paint={paints.future}
            layout={{ "line-cap": "butt" }}
          />
        )}
        <Layer
          id="timetravel-points-opened"
          type="circle"
          filter={markerFilters.opened}
          paint={paints.pointsOpened}
        />
        <Layer
          id="timetravel-points-under-construction"
          type="circle"
          filter={markerFilters.underConstruction}
          paint={paints.pointsUnderConstruction}
        />
        {showFuture && (
          <Layer
            id="timetravel-points-future"
            type="circle"
            filter={markerFilters.future}
            paint={paints.pointsFuture}
          />
        )}
      </Source>

      {/* Both overlays are absolutely positioned: react-map-gl renders its
          children in a static block that the canvas paints over, so anything
          in the flow would be hidden and would not answer a click. */}
      {showLegend && categories.length > 0 && (
        <div className="absolute left-2 top-2 z-10">
          <MapLegend categories={categories} />
        </div>
      )}

      {/* pointer-events are off on the strip and back on for the bar itself,
          so the map still pans either side of it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-2 sm:p-3">
        <div className="pointer-events-auto max-w-full">
          <TimeSlider
            month={month}
            min={minMonth}
            max={maxMonth}
            playing={playing}
            locale={locale}
            speedIndex={speedIndex}
            onMonthChange={onMonthChange}
            onPlayingChange={onPlayingChange}
            onSpeedIndexChange={onSpeedIndexChange}
          />
        </div>
      </div>
    </>
  );
}
