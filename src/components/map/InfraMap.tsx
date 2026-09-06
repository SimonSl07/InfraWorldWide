"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map,
  Marker,
  Popup,
  Source,
  Layer,
  NavigationControl,
  ScaleControl,
  FullscreenControl,
  GeolocateControl,
  type MapMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { FeatureCollection, Feature } from "geojson";
import { useTranslations } from "next-intl";
import type {
  ExpressionSpecification,
  FilterSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  categoryColorExpr,
  countryFillOpacity,
  countryOutlineColor,
  countryOutlineOpacity,
  countryOutlineWidth,
  dimByCountry,
} from "@/lib/map-style";
import {
  buildMonthFilters,
  shouldShowFuture,
  type CategoryStatusSelection,
  type MapView,
} from "@/lib/map-filters";
import { mapLocale } from "@/lib/map-locale";
import { mapColorsFor } from "@/lib/map-theme";
import { basemapUrl, defaultBasemapId } from "@/lib/basemaps";
import { usePrefersDark } from "./useColorScheme";
import type { LotEntry } from "@/lib/lot-list";
import type { CityMarkerProperties } from "@/lib/map-features";
import { formatKm } from "@/lib/format";
import {
  FUTURE_DASH,
  PROJECTED_HATCH_DASH,
  UNDER_CONSTRUCTION_DASH,
} from "@/lib/line-dashes";
import { hoveredCountry, resolveMapClick } from "@/lib/map-click";
import type { BBox } from "@/lib/geo";

/** Where the map opens when no ?v= says otherwise. */
export const DEFAULT_VIEW: MapView = {
  longitude: 24.97,
  latitude: 45.9,
  zoom: 5.6,
};

interface InfraMapProps {
  geojson: FeatureCollection;
  /** Country outlines used as click targets; empty until they load. */
  countries: FeatureCollection;
  /** City markers; empty until they load. */
  cities: FeatureCollection;
  /** Absolute month index (year*12 + month-1). */
  month: number;
  /**
   * The present month, on the same scale. Read once by the owner so the map
   * and the panels beside it cannot straddle a month boundary.
   */
  nowMonth: number;
  selection: CategoryStatusSelection;
  selectedLotId: string | null;
  selectedCountry: string | null;
  selectedCity: string | null;
  onSelectLot: (props: LotEntry | null) => void;
  onSelectCountry: (code: string | null) => void;
  onSelectCity: (key: string | null) => void;
  /** UI locale, for MapLibre's own strings and the km figures. */
  locale: string;
  /** Camera restored from ?v=; read once, on mount. */
  initialView?: MapView | null;
  /** Fires when the camera settles, so the URL can carry the view. */
  onViewChange?: (view: MapView) => void;
  /**
   * A box to fly to. The nonce is what makes it fire: searching for the
   * same project twice has to move the camera both times.
   */
  focus?: { bbox: BBox; nonce: number } | null;
  /**
   * Track that opened inside the comparison window, drawn over everything
   * else. Null when the diff is switched off.
   */
  newlyOpened?: FilterSpecification | null;
  /** Basemap style URL. Defaults to the one the map has always used. */
  mapStyle?: string;
}

/** Layer ids that answer clicks, most specific first. */
export const LOT_LAYER_IDS = [
  "infra-hit-opened",
  "infra-hit-under-construction",
  "infra-hit-future",
  "infra-points-opened",
  "infra-points-under-construction",
  "infra-points-future",
];

export const COUNTRY_LAYER_ID = "country-fill";

export const INTERACTIVE_LAYER_IDS = [...LOT_LAYER_IDS, COUNTRY_LAYER_ID];

/** Width of the invisible click target around each line (px). */
const HIT_WIDTH = 30;

/** Never matches: keeps a layer mounted while hiding everything in it. */
const MATCH_NOTHING = [
  "==",
  ["get", "lotId"],
  "__never__",
] as unknown as FilterSpecification;

/**
 * Line width ramps, shared so the hatch overlay tracks the line it marks.
 *
 * Cast because they are hoisted out of the JSX: outside a paint literal
 * TypeScript widens the tuple and stops recognising the expression.
 */
const OPENED_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  2,
  8,
  4.5,
  12,
  8,
] as unknown as ExpressionSpecification;
const POINT_RADIUS = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  3.5,
  8,
  6,
  12,
  9,
] as unknown as ExpressionSpecification;

export default function InfraMap({
  geojson,
  countries,
  cities,
  month,
  nowMonth,
  selection,
  selectedLotId,
  selectedCountry,
  selectedCity,
  onSelectLot,
  onSelectCountry,
  onSelectCity,
  locale,
  initialView,
  onViewChange,
  focus,
  newlyOpened,
  mapStyle,
}: InfraMapProps) {
  const t = useTranslations();
  const [cursor, setCursor] = useState<string>("grab");
  const [hovered, setHovered] = useState<string | null>(null);
  /**
   * The tooltip. Anchored where the pointer first met the line rather than
   * followed pixel by pixel: mousemove fires continuously, and re-rendering
   * every layer on each event is exactly what the map cannot afford.
   */
  const [hoveredLot, setHoveredLot] = useState<{
    props: LotEntry;
    longitude: number;
    latitude: number;
  } | null>(null);
  const mapRef = useRef<MapRef | null>(null);

  // MapLibre paint values never see a CSS custom property, so unlike the
  // rest of the app the canvas has to be told which palette to draw with.
  const prefersDark = usePrefersDark();
  const theme = useMemo(() => mapColorsFor(prefersDark), [prefersDark]);
  const colorExpr = useMemo(
    () => categoryColorExpr(undefined, theme.category),
    [theme],
  );
  const maplibreLocale = useMemo(() => mapLocale(t), [t]);

  const filters = useMemo(
    () => buildMonthFilters(month, selection, nowMonth),
    [month, selection, nowMonth],
  );

  const showFuture = shouldShowFuture(month, nowMonth);

  const dim = useCallback(
    (full: number) => dimByCountry(full, selectedCountry),
    [selectedCountry],
  );

  // Point-marker variants of the month filters (bridges/tunnels get midpoint
  // markers in the data build so they're visible at country zoom).
  const pointFilters = useMemo(() => {
    const markerOnly = [
      "==",
      ["get", "marker"],
      true,
    ] as unknown as FilterSpecification;
    const wrap = (f: FilterSpecification) =>
      ["all", f, markerOnly] as unknown as FilterSpecification;
    return {
      opened: wrap(filters.opened),
      underConstruction: wrap(filters.underConstruction),
      future: wrap(filters.future),
    };
  }, [filters]);

  /**
   * Sections drawn as open only because a date projected from the contract
   * has passed. The flag is written onto every feature by the build and was
   * never used in styling, so a projection looked exactly like a fact.
   * Only meaningful ahead of today: nothing is projected open in the past.
   */
  const projectedFilter = useMemo(
    () =>
      [
        "all",
        ["==", ["get", "expectedOpeningDerived"], true],
        filters.opened,
      ] as unknown as FilterSpecification,
    [filters],
  );
  const showProjected = month > nowMonth;

  /**
   * Paint objects, built once per selection rather than per render.
   *
   * Hover and playback both fire continuously; a fresh object literal on
   * every one of these layers made react-map-gl walk and diff all of them
   * many times a second.
   */
  const paints = useMemo(
    () => ({
      hit: {
        "line-color": theme.markerStroke,
        "line-width": HIT_WIDTH,
        "line-opacity": 0.01,
      },
      casing: {
        "line-color": theme.casing,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 4, 8, 7, 12, 11] as unknown as ExpressionSpecification,
        "line-opacity": dim(0.7),
      },
      opened: {
        "line-color": colorExpr,
        "line-width": OPENED_WIDTH,
        "line-opacity": dim(0.95),
      },
      projected: {
        // White overprint: reads as hatching over whatever colour is under it.
        "line-color": theme.casing,
        "line-width": OPENED_WIDTH,
        "line-dasharray": PROJECTED_HATCH_DASH,
        "line-opacity": dim(0.85),
      },
      underConstruction: {
        "line-color": colorExpr,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2.5, 8, 5, 12, 9] as unknown as ExpressionSpecification,
        "line-dasharray": UNDER_CONSTRUCTION_DASH,
        "line-opacity": dim(1),
      },
      future: {
        "line-color": colorExpr,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2, 8, 4, 12, 7] as unknown as ExpressionSpecification,
        "line-dasharray": FUTURE_DASH,
        "line-opacity": dim(0.55),
      },
      pointsOpened: {
        "circle-color": colorExpr,
        "circle-radius": POINT_RADIUS,
        "circle-stroke-color": theme.markerStroke,
        "circle-stroke-width": 1.5,
        "circle-opacity": dim(0.95),
      },
      pointsUnderConstruction: {
        "circle-color": colorExpr,
        "circle-radius": POINT_RADIUS,
        "circle-stroke-color": theme.markerStroke,
        "circle-stroke-width": 1.5,
        "circle-opacity": dim(0.7),
      },
      pointsFuture: {
        "circle-color": colorExpr,
        "circle-radius": POINT_RADIUS,
        "circle-stroke-color": theme.markerStroke,
        "circle-stroke-width": 1.5,
        "circle-opacity": dim(0.4),
      },
      // Newly opened track in the comparison window. Drawn as a wide glow
      // under nothing, over everything: it answers "what changed", so it
      // has to win against the network it sits on.
      newlyOpened: {
        "line-color": theme.newlyOpened,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          6,
          8,
          11,
          12,
          17,
        ] as unknown as ExpressionSpecification,
        "line-opacity": 0.55,
        "line-blur": 1,
      },
      selected: {
        "line-color": theme.selectedHighlight,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 5, 8, 9, 12, 14] as unknown as ExpressionSpecification,
        "line-opacity": 0.5,
      },
    }),
    [colorExpr, dim, theme],
  );

  // Split from the line paints because these two are the only ones that
  // depend on the hover, which changes on every pointer move.
  const countryPaints = useMemo(
    () => ({
      fill: {
        "fill-color": theme.countryFill,
        "fill-opacity": countryFillOpacity(selectedCountry, hovered),
      },
      outline: {
        "line-color": countryOutlineColor(selectedCountry, theme),
        "line-width": countryOutlineWidth(selectedCountry),
        "line-opacity": countryOutlineOpacity(selectedCountry),
      },
    }),
    [selectedCountry, hovered, theme],
  );

  const selectedFilter = useMemo(
    () =>
      selectedLotId
        ? ([
            "==",
            ["get", "lotId"],
            selectedLotId,
          ] as unknown as FilterSpecification)
        : MATCH_NOTHING,
    [selectedLotId],
  );

  /** The selections are mutually exclusive — they share the panel. */
  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      const hit = resolveMapClick((e.features ?? []) as Feature[], [
        e.lngLat.lng,
        e.lngLat.lat,
      ]);
      // City markers are DOM elements that stop propagation, so a click
      // reaching here is never a city.
      onSelectCity(null);
      switch (hit.kind) {
        case "lot":
          onSelectCountry(null);
          onSelectLot(hit.feature.properties as unknown as LotEntry);
          return;
        case "country":
          onSelectLot(null);
          onSelectCountry(hit.code);
          return;
        default:
          onSelectLot(null);
          onSelectCountry(null);
      }
    },
    [onSelectCity, onSelectCountry, onSelectLot],
  );

  /** Tracks the country tint and the hovered lot in one pass. */
  const handleMouseMove = useCallback((e: MapMouseEvent) => {
    const features = (e.features ?? []) as Feature[];
    const hit = resolveMapClick(features, [e.lngLat.lng, e.lngLat.lat]);

    if (hit.kind === "lot") {
      const props = hit.feature.properties as unknown as LotEntry;
      setHovered(null);
      // Only when the lot itself changes: tracing one road must not rebuild
      // the tooltip on every pixel.
      setHoveredLot((current) =>
        current?.props.lotId === props.lotId
          ? current
          : { props, longitude: e.lngLat.lng, latitude: e.lngLat.lat },
      );
      return;
    }

    setHoveredLot(null);
    const code = hoveredCountry(features);
    setHovered((current) => (current === code ? current : code));
  }, []);

  const handleMoveEnd = useCallback(() => {
    const map = mapRef.current;
    if (!map || !onViewChange) return;
    const center = map.getCenter();
    onViewChange({
      longitude: center.lng,
      latitude: center.lat,
      zoom: map.getZoom(),
    });
  }, [onViewChange]);

  // Fitting the camera to the selection also serves the shared ?c= link,
  // which restores a country the viewer has never had on screen.
  useEffect(() => {
    if (!selectedCountry) return;
    const feature = countries.features.find(
      (f) => f.properties?.country === selectedCountry,
    );
    const bbox = feature?.properties?.bbox as BBox | undefined;
    const map = mapRef.current;
    if (!map || !bbox) return;
    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      {
        // Asymmetric: the panel covers the right edge and the time slider
        // the bottom, so a centred fit would hide part of the country.
        padding: { top: 48, bottom: 96, left: 48, right: 352 },
        duration: 700,
      },
    );
  }, [selectedCountry, countries]);

  // Search results fly the camera to the project they name.
  const focusNonce = focus?.nonce;
  const focusBbox = focus?.bbox;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusBbox || focusNonce === undefined) return;
    map.fitBounds(
      [
        [focusBbox[0], focusBbox[1]],
        [focusBbox[2], focusBbox[3]],
      ],
      {
        padding: { top: 64, bottom: 112, left: 64, right: 368 },
        maxZoom: 13,
        duration: 900,
      },
    );
  }, [focusNonce, focusBbox]);

  return (
    <Map
      ref={mapRef}
      initialViewState={initialView ?? DEFAULT_VIEW}
      style={{ width: "100%", height: "100%" }}
      mapStyle={mapStyle ?? basemapUrl(defaultBasemapId(prefersDark))}
      attributionControl={{ compact: true }}
      // MapLibre renders its own controls and the canvas label from an
      // internal English table that next-intl never sees.
      locale={maplibreLocale}
      cursor={cursor}
      interactiveLayerIds={INTERACTIVE_LAYER_IDS}
      onClick={handleClick}
      onMoveEnd={handleMoveEnd}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setCursor("pointer")}
      onMouseLeave={() => {
        setCursor("grab");
        setHovered(null);
        setHoveredLot(null);
      }}
    >
      {/* Standard controls. The scale bar earns its place before any of the
          others here: the whole subject is kilometres. */}
      <NavigationControl position="top-right" visualizePitch={false} />
      <FullscreenControl position="top-right" />
      <GeolocateControl position="top-right" trackUserLocation={false} />
      <ScaleControl position="bottom-right" unit="metric" maxWidth={120} />

      {/* Hovering a road used to change the cursor and nothing else, so
          reading the network meant clicking every segment in turn. */}
      {hoveredLot && (
        <Popup
          longitude={hoveredLot.longitude}
          latitude={hoveredLot.latitude}
          anchor="bottom"
          offset={12}
          closeButton={false}
          closeOnClick={false}
          // Never steal focus: the keyboard list below owns the focus ring.
          focusAfterOpen={false}
          // Without this the popup swallows the click that selects the lot,
          // and the pointer entering it fires mouseleave on the canvas.
          className="pointer-events-none"
          maxWidth="260px"
        >
          <div className="px-1 py-0.5 text-xs leading-snug">
            <div className="font-semibold text-ink">
              {hoveredLot.props.projectName}
            </div>
            <div className="text-ink-soft">{hoveredLot.props.lotName}</div>
            <div className="mt-1 text-ink-muted">
              {t(`categorySingular.${hoveredLot.props.category}`)}
              {" · "}
              {t(`status.${hoveredLot.props.status}`)}
              {" · "}
              {formatKm(hoveredLot.props.lengthKm, locale)}
            </div>
            {hoveredLot.props.expectedOpeningDerived && (
              <div className="mt-0.5 text-[11px] text-warn">
                {t("project.expectedOpeningDerived")}
              </div>
            )}
          </div>
        </Popup>
      )}

      {/* Cities are DOM markers rather than a map layer: they need a label
          at every zoom (which would otherwise mean depending on the
          basemap's glyph fonts) and they need to be real buttons. The
          click handler stops propagation so the map's own onClick, which
          would clear the selection, never runs. */}
      {cities.features.map((feature) => {
        const props = feature.properties as unknown as CityMarkerProperties;
        if (feature.geometry.type !== "Point") return null;
        const [longitude, latitude] = feature.geometry.coordinates;
        const active = selectedCity === props.city;
        return (
          <Marker
            key={props.city}
            longitude={longitude}
            latitude={latitude}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelectCity(active ? null : props.city);
            }}
          >
            <button
              type="button"
              aria-pressed={active}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium shadow-sm transition-colors ${
                active
                  ? "border-inverse bg-inverse text-on-inverse"
                  : "border-line-strong bg-surface/95 text-ink-soft hover:border-inverse"
              }`}
            >
              <span
                aria-hidden
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  active ? "bg-surface" : "bg-inverse"
                }`}
              />
              {props.name}
            </button>
          </Marker>
        );
      })}

      {/* Mounted first so the outlines sit beneath every infrastructure
          layer — they are a click target and a backdrop, not a feature. */}
      <Source id="countries" type="geojson" data={countries}>
        <Layer id={COUNTRY_LAYER_ID} type="fill" paint={countryPaints.fill} />
        <Layer id="country-outline" type="line" paint={countryPaints.outline} />
      </Source>

      <Source id="infra" type="geojson" data={geojson}>
        {/* invisible fat hit areas — opacity-0 layers stay queryable by
            queryRenderedFeatures (visibility:none would not be) */}
        <Layer
          id="infra-hit-opened"
          type="line"
          filter={filters.opened}
          paint={paints.hit}
        />
        <Layer
          id="infra-hit-under-construction"
          type="line"
          filter={filters.underConstruction}
          paint={paints.hit}
        />
        <Layer
          id="infra-hit-future"
          type="line"
          // keep the layer mounted even when hidden — interactiveLayerIds
          // references it, and MapLibre errors on missing interactive layers
          filter={showFuture ? filters.future : MATCH_NOTHING}
          paint={paints.hit}
        />
        {/* white casing for legibility over the basemap */}
        <Layer
          id="infra-casing"
          type="line"
          filter={filters.opened}
          paint={paints.casing}
          layout={{ "line-cap": "round" }}
        />
        <Layer
          id="infra-opened"
          type="line"
          filter={filters.opened}
          paint={paints.opened}
          layout={{ "line-cap": "round" }}
        />
        <Layer
          id="infra-under-construction"
          type="line"
          filter={filters.underConstruction}
          paint={paints.underConstruction}
          layout={{ "line-cap": "butt" }}
        />
        {showFuture && (
          <Layer
            id="infra-future"
            type="line"
            filter={filters.future}
            paint={paints.future}
            layout={{ "line-cap": "butt" }}
          />
        )}
        {/* Hatching over anything open only on a projected date. */}
        {showProjected && (
          <Layer
            id="infra-projected"
            type="line"
            filter={projectedFilter}
            paint={paints.projected}
            layout={{ "line-cap": "butt" }}
          />
        )}
        {/* midpoint markers for bridges/tunnels (visible at country zoom) */}
        <Layer
          id="infra-points-opened"
          type="circle"
          filter={pointFilters.opened}
          paint={paints.pointsOpened}
        />
        <Layer
          id="infra-points-under-construction"
          type="circle"
          filter={pointFilters.underConstruction}
          paint={paints.pointsUnderConstruction}
        />
        <Layer
          id="infra-points-future"
          type="circle"
          filter={showFuture ? pointFilters.future : MATCH_NOTHING}
          paint={paints.pointsFuture}
        />
        {newlyOpened && (
          <Layer
            id="infra-newly-opened"
            type="line"
            filter={newlyOpened}
            paint={paints.newlyOpened}
            layout={{ "line-cap": "round" }}
          />
        )}
        <Layer
          id="infra-selected"
          type="line"
          filter={selectedFilter}
          paint={paints.selected}
          layout={{ "line-cap": "round" }}
        />
      </Source>
    </Map>
  );
}
