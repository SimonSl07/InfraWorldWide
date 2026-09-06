"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Map, Source, Layer, ScaleControl } from "react-map-gl/maplibre";
import type { FeatureCollection } from "geojson";
import type { FilterSpecification } from "maplibre-gl";
import { useTranslations } from "next-intl";
import "maplibre-gl/dist/maplibre-gl.css";
import { categoryColorExpr, statusDashExpr } from "@/lib/map-style";
import { mapColorsFor } from "@/lib/map-theme";
import { usePrefersDark } from "./useColorScheme";
import {
  buildMonthFilters,
  fromMonthIndex,
  type CategoryStatusSelection,
  type MapView,
} from "@/lib/map-filters";
import { openedBetween } from "@/lib/map-delta";
import type { LotEntry } from "@/lib/lot-list";
import { mapLocale } from "@/lib/map-locale";
import { basemapUrl } from "@/lib/basemaps";
import { formatKm } from "@/lib/format";
import { clampSwipe, swipeClipPath, swipeFromPointer } from "@/lib/swipe";

/**
 * Two years of the network, side by side under a swipe handle.
 *
 * A swipe rather than two panes: the interesting sections are a few pixels
 * wide at country zoom, and two half-width maps put the same road in two
 * places at two scales, which is exactly the comparison the eye is worst
 * at. Stacked and wiped, the road stays in one place and only its state
 * changes, so a section that appears as the handle passes is unmissable.
 *
 * Both panes render the same source with different month filters, and the
 * cameras are locked together, so it is one map showing two dates.
 */
export default function CompareMap({
  geojson,
  beforeMonth,
  afterMonth,
  nowMonth,
  selection,
  locale,
  basemapId,
  initialView,
  lots,
}: {
  geojson: FeatureCollection;
  beforeMonth: number;
  afterMonth: number;
  nowMonth: number;
  selection: CategoryStatusSelection;
  locale: string;
  basemapId: string;
  initialView: MapView;
  /** Every lot, for the readout under the handle. */
  lots: LotEntry[];
}) {
  // MapLibre paint values cannot read a CSS custom property, so the
  // canvas is told which palette to draw with.
  const prefersDark = usePrefersDark();
  const theme = useMemo(() => mapColorsFor(prefersDark), [prefersDark]);
  const t = useTranslations();
  const [position, setPosition] = useState(0.5);
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  // The two maps are kept in step by pushing the moving one's camera onto
  // the other. The guard stops that assignment bouncing back.
  const syncing = useRef(false);
  const beforeRef = useRef<maplibregl.Map | null>(null);
  const afterRef = useRef<maplibregl.Map | null>(null);

  const colorExpr = useMemo(
    () => categoryColorExpr(undefined, theme.category),
    [theme],
  );
  const dashExpr = useMemo(() => statusDashExpr(), []);
  const maplibreLocale = useMemo(() => mapLocale(t), [t]);
  const styleUrl = useMemo(() => basemapUrl(basemapId), [basemapId]);

  const beforeFilters = useMemo(
    () => buildMonthFilters(beforeMonth, selection, nowMonth),
    [beforeMonth, selection, nowMonth],
  );
  const afterFilters = useMemo(
    () => buildMonthFilters(afterMonth, selection, nowMonth),
    [afterMonth, selection, nowMonth],
  );

  const delta = useMemo(
    () => openedBetween(lots, { from: beforeMonth, to: afterMonth, nowMonth }),
    [lots, beforeMonth, afterMonth, nowMonth],
  );

  const paints = useMemo(
    () => ({
      casing: {
        "line-color": theme.casing,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 4, 8, 7, 12, 11],
        "line-opacity": 0.7,
      },
      line: {
        "line-color": colorExpr,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          2,
          8,
          4.5,
          12,
          8,
        ],
        "line-dasharray": dashExpr,
        "line-opacity": 0.95,
      },
    }),
    [colorExpr, dashExpr, theme],
  );

  /** Copy one camera onto the other, without echoing back. */
  const sync = useCallback(
    (from: maplibregl.Map | null, to: maplibregl.Map | null) => {
      if (!from || !to || syncing.current) return;
      syncing.current = true;
      to.jumpTo({
        center: from.getCenter(),
        zoom: from.getZoom(),
        bearing: from.getBearing(),
        pitch: from.getPitch(),
      });
      syncing.current = false;
    },
    [],
  );

  const move = useCallback((clientX: number) => {
    const frame = frameRef.current?.getBoundingClientRect();
    if (!frame) return;
    setPosition(swipeFromPointer(clientX, frame));
  }, []);

  const pane = (which: "before" | "after") => {
    const filters = which === "before" ? beforeFilters : afterFilters;
    return (
      <>
        <Source id={`compare-${which}`} type="geojson" data={geojson}>
          <Layer
            id={`compare-${which}-casing`}
            type="line"
            filter={filters.opened}
            paint={paints.casing as never}
            layout={{ "line-cap": "round" }}
          />
          <Layer
            id={`compare-${which}-opened`}
            type="line"
            filter={filters.opened}
            paint={paints.line as never}
            layout={{ "line-cap": "round" }}
          />
          <Layer
            id={`compare-${which}-building`}
            type="line"
            filter={filters.underConstruction as FilterSpecification}
            paint={paints.line as never}
            layout={{ "line-cap": "butt" }}
          />
        </Source>
        <ScaleControl position="bottom-right" unit="metric" maxWidth={110} />
      </>
    );
  };

  const label = (month: number) => String(fromMonthIndex(month).year);

  return (
    <div
      ref={frameRef}
      className="relative h-full w-full touch-none overflow-hidden select-none"
      onPointerMove={(e) => dragging && move(e.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerLeave={() => setDragging(false)}
    >
      {/* Bottom pane: the earlier date, visible left of the handle. */}
      <div className="absolute inset-0">
        <Map
          ref={(r) => {
            beforeRef.current = r?.getMap() ?? null;
          }}
          initialViewState={initialView}
          style={{ width: "100%", height: "100%" }}
          mapStyle={styleUrl}
          locale={maplibreLocale}
          attributionControl={{ compact: true }}
          onMove={() => sync(beforeRef.current, afterRef.current)}
        >
          {pane("before")}
        </Map>
      </div>

      {/* Top pane: the later date, clipped to the right of the handle. */}
      <div
        className="absolute inset-0"
        style={{ clipPath: swipeClipPath(position) }}
      >
        <Map
          ref={(r) => {
            afterRef.current = r?.getMap() ?? null;
          }}
          initialViewState={initialView}
          style={{ width: "100%", height: "100%" }}
          mapStyle={styleUrl}
          locale={maplibreLocale}
          attributionControl={false}
          onMove={() => sync(afterRef.current, beforeRef.current)}
        >
          {pane("after")}
        </Map>
      </div>

      {/* Year labels, pinned to the side each pane occupies. */}
      <div className="pointer-events-none absolute top-3 left-3 rounded-full bg-inverse/85 px-2.5 py-1 text-xs font-semibold text-on-inverse tabular-nums">
        {label(beforeMonth)}
      </div>
      <div className="pointer-events-none absolute top-3 right-3 rounded-full bg-inverse/85 px-2.5 py-1 text-xs font-semibold text-on-inverse tabular-nums">
        {label(afterMonth)}
      </div>

      {/* The handle. A slider role, so it is draggable and also arrow-key
          operable: a swipe that only answers to a mouse would repeat the
          accessibility problem the lot list just fixed. */}
      <div
        className="absolute inset-y-0 w-0.5 bg-surface shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ left: `${clampSwipe(position) * 100}%` }}
      >
        <div
          role="slider"
          tabIndex={0}
          aria-label={t("map.compareHandle")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position * 100)}
          aria-valuetext={t("map.compareHandleValue", {
            before: label(beforeMonth),
            after: label(afterMonth),
          })}
          onPointerDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onKeyDown={(e) => {
            const step =
              e.key === "ArrowLeft" ? -0.05 : e.key === "ArrowRight" ? 0.05 : 0;
            if (step === 0) return;
            e.preventDefault();
            setPosition((p) => clampSwipe(p + step));
          }}
          className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-line-strong bg-surface shadow-lg focus:ring-2 focus:ring-focus focus:outline-none"
        >
          <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
            <path
              d="M5.5 2 2 6l3.5 4M10.5 2 14 6l-3.5 4"
              fill="none"
              stroke="var(--ink-soft)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* What the wipe is showing, in one line. */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs text-ink-soft shadow backdrop-blur">
        {t("map.compareSummary", {
          km: formatKm(delta.km, locale),
          before: label(beforeMonth),
          after: label(afterMonth),
        })}
      </div>
    </div>
  );
}
