"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map,
  Source,
  Layer,
  type MapMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { FeatureCollection, Feature } from "geojson";
import type {
  ExpressionSpecification,
  FilterSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Category } from "@/lib/schema";
import {
  CATEGORY_COLORS,
  OPENFREEMAP_STYLE,
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
} from "@/lib/map-filters";
import { hoveredCountry, resolveMapClick } from "@/lib/map-click";
import type { BBox } from "@/lib/geo";

export interface LotFeatureProps {
  lotId: string;
  projectId: string;
  projectName: string;
  lotName: string;
  country: string;
  category: Category;
  status: string;
  lengthKm: number;
  opened: number | null;
  constructionStart: number | null;
}

interface InfraMapProps {
  geojson: FeatureCollection;
  /** Country outlines used as click targets; empty until they load. */
  countries: FeatureCollection;
  /** Absolute month index (year*12 + month-1). */
  month: number;
  selection: CategoryStatusSelection;
  selectedLotId: string | null;
  selectedCountry: string | null;
  onSelectLot: (props: LotFeatureProps | null) => void;
  onSelectCountry: (code: string | null) => void;
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

export default function InfraMap({
  geojson,
  countries,
  month,
  selection,
  selectedLotId,
  selectedCountry,
  onSelectLot,
  onSelectCountry,
}: InfraMapProps) {
  const [cursor, setCursor] = useState<string>("grab");
  const [hovered, setHovered] = useState<string | null>(null);
  const mapRef = useRef<MapRef | null>(null);

  const nowDate = new Date();
  const nowMonth = nowDate.getFullYear() * 12 + nowDate.getMonth();

  const colorExpr = useMemo(
    () =>
      [
        "match",
        ["get", "category"],
        ...Object.entries(CATEGORY_COLORS).flat(),
        "#6b7280",
      ] as unknown as ExpressionSpecification,
    [],
  );

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

  /** The two selections are mutually exclusive — they share the panel. */
  function handleClick(e: MapMouseEvent) {
    const hit = resolveMapClick((e.features ?? []) as Feature[], [
      e.lngLat.lng,
      e.lngLat.lat,
    ]);
    switch (hit.kind) {
      case "lot":
        onSelectCountry(null);
        onSelectLot(hit.feature.properties as unknown as LotFeatureProps);
        return;
      case "country":
        onSelectLot(null);
        onSelectCountry(hit.code);
        return;
      default:
        onSelectLot(null);
        onSelectCountry(null);
    }
  }

  /** Tracks which country the pointer is over, for the hover tint. */
  function handleMouseMove(e: MapMouseEvent) {
    const code = hoveredCountry((e.features ?? []) as Feature[]);
    setHovered((current) => (current === code ? current : code));
  }

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

  return (
    <Map
      ref={mapRef}
      initialViewState={{ longitude: 24.97, latitude: 45.9, zoom: 5.6 }}
      style={{ width: "100%", height: "100%" }}
      mapStyle={OPENFREEMAP_STYLE}
      attributionControl={{ compact: true }}
      cursor={cursor}
      interactiveLayerIds={INTERACTIVE_LAYER_IDS}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setCursor("pointer")}
      onMouseLeave={() => {
        setCursor("grab");
        setHovered(null);
      }}
    >
      {/* Mounted first so the outlines sit beneath every infrastructure
          layer — they are a click target and a backdrop, not a feature. */}
      <Source id="countries" type="geojson" data={countries}>
        <Layer
          id={COUNTRY_LAYER_ID}
          type="fill"
          paint={{
            "fill-color": "#0f172a",
            "fill-opacity": countryFillOpacity(selectedCountry, hovered),
          }}
        />
        <Layer
          id="country-outline"
          type="line"
          paint={{
            "line-color": countryOutlineColor(selectedCountry),
            "line-width": countryOutlineWidth(selectedCountry),
            "line-opacity": countryOutlineOpacity(selectedCountry),
          }}
        />
      </Source>

      <Source id="infra" type="geojson" data={geojson}>
        {/* invisible fat hit areas — opacity-0 layers stay queryable by
            queryRenderedFeatures (visibility:none would not be) */}
        <Layer
          id="infra-hit-opened"
          type="line"
          filter={filters.opened}
          paint={{ "line-color": "#000000", "line-width": HIT_WIDTH, "line-opacity": 0.01 }}
        />
        <Layer
          id="infra-hit-under-construction"
          type="line"
          filter={filters.underConstruction}
          paint={{ "line-color": "#000000", "line-width": HIT_WIDTH, "line-opacity": 0.01 }}
        />
        <Layer
          id="infra-hit-future"
          type="line"
          filter={
            // keep the layer mounted even when hidden — interactiveLayerIds
            // references it, and MapLibre errors on missing interactive layers
            showFuture
              ? filters.future
              : ([
                  "==",
                  ["get", "lotId"],
                  "__never__",
                ] as unknown as FilterSpecification)
          }
          paint={{ "line-color": "#000000", "line-width": HIT_WIDTH, "line-opacity": 0.01 }}
        />
        {/* white casing for legibility over the basemap */}
        <Layer
          id="infra-casing"
          type="line"
          filter={filters.opened}
          paint={{
            "line-color": "#ffffff",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              4,
              4,
              8,
              7,
              12,
              11,
            ],
            "line-opacity": dim(0.7),
          }}
          layout={{ "line-cap": "round" }}
        />
        <Layer
          id="infra-opened"
          type="line"
          filter={filters.opened}
          paint={{
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
            "line-opacity": dim(0.95),
          }}
          layout={{ "line-cap": "round" }}
        />
        <Layer
          id="infra-under-construction"
          type="line"
          filter={filters.underConstruction}
          paint={{
            "line-color": colorExpr,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              4,
              2.5,
              8,
              5,
              12,
              9,
            ],
            "line-dasharray": [3, 2.2],
            "line-opacity": dim(1),
          }}
          layout={{ "line-cap": "butt" }}
        />
        {showFuture && (
          <Layer
            id="infra-future"
            type="line"
            filter={filters.future}
            paint={{
              "line-color": colorExpr,
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                4,
                2,
                8,
                4,
                12,
                7,
              ],
              "line-dasharray": [1, 2],
              "line-opacity": dim(0.55),
            }}
            layout={{ "line-cap": "butt" }}
          />
        )}
        {/* midpoint markers for bridges/tunnels (visible at country zoom) */}
        <Layer
          id="infra-points-opened"
          type="circle"
          filter={pointFilters.opened}
          paint={{
            "circle-color": colorExpr,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3.5, 8, 6, 12, 9],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-opacity": dim(0.95),
          }}
        />
        <Layer
          id="infra-points-under-construction"
          type="circle"
          filter={pointFilters.underConstruction}
          paint={{
            "circle-color": colorExpr,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3.5, 8, 6, 12, 9],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-opacity": dim(0.7),
          }}
        />
        <Layer
          id="infra-points-future"
          type="circle"
          filter={
            showFuture
              ? pointFilters.future
              : ([
                  "==",
                  ["get", "lotId"],
                  "__never__",
                ] as unknown as FilterSpecification)
          }
          paint={{
            "circle-color": colorExpr,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3.5, 8, 6, 12, 9],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-opacity": dim(0.4),
          }}
        />
        {selectedLotId && (
          <Layer
            id="infra-selected"
            type="line"
            filter={
              [
                "==",
                ["get", "lotId"],
                selectedLotId,
              ] as unknown as FilterSpecification
            }
            paint={{
              "line-color": "#facc15", // yellow-400 highlight
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                4,
                5,
                8,
                9,
                12,
                14,
              ],
              "line-opacity": 0.5,
            }}
            layout={{ "line-cap": "round" }}
          />
        )}
      </Source>
    </Map>
  );
}
