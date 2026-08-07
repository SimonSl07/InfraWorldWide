"use client";

import { useMemo, useState } from "react";
import { Map, Source, Layer, type MapMouseEvent } from "react-map-gl/maplibre";
import type { FeatureCollection, Feature } from "geojson";
import type {
  ExpressionSpecification,
  FilterSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Category } from "@/lib/schema";
import { CATEGORY_COLORS, OPENFREEMAP_STYLE } from "@/lib/map-style";
import {
  buildYearFilters,
  shouldShowFuture,
  type CategoryStatusSelection,
} from "@/lib/map-filters";
import { nearestFeature } from "@/lib/geo";

export interface LotFeatureProps {
  lotId: string;
  projectId: string;
  projectName: string;
  lotName: string;
  category: Category;
  status: string;
  lengthKm: number;
  opened: number | null;
  constructionStart: number | null;
}

interface InfraMapProps {
  geojson: FeatureCollection;
  year: number;
  selection: CategoryStatusSelection;
  selectedLotId: string | null;
  onSelectLot: (props: LotFeatureProps | null) => void;
}

export const INTERACTIVE_LAYER_IDS = [
  "infra-hit-opened",
  "infra-hit-under-construction",
  "infra-hit-future",
  "infra-points-opened",
  "infra-points-under-construction",
  "infra-points-future",
];

/** Width of the invisible click target around each line (px). */
const HIT_WIDTH = 30;

export default function InfraMap({
  geojson,
  year,
  selection,
  selectedLotId,
  onSelectLot,
}: InfraMapProps) {
  const [cursor, setCursor] = useState<string>("grab");

  const nowYear = new Date().getFullYear();

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
    () => buildYearFilters(year, selection, nowYear),
    [year, selection, nowYear],
  );

  const showFuture = shouldShowFuture(year, nowYear);

  // Point-marker variants of the year filters (bridges/tunnels get midpoint
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

  function handleClick(e: MapMouseEvent) {
    const hits = (e.features ?? []) as Feature[];
    if (hits.length === 0) {
      onSelectLot(null);
      return;
    }
    // Overlapping hit areas: select the line closest to the click point.
    const best =
      hits.length === 1
        ? hits[0]
        : nearestFeature(hits, [e.lngLat.lng, e.lngLat.lat]);
    if (!best?.properties) {
      onSelectLot(null);
      return;
    }
    onSelectLot(best.properties as unknown as LotFeatureProps);
  }

  return (
    <Map
      initialViewState={{ longitude: 24.97, latitude: 45.9, zoom: 5.6 }}
      style={{ width: "100%", height: "100%" }}
      mapStyle={OPENFREEMAP_STYLE}
      attributionControl={{ compact: true }}
      cursor={cursor}
      interactiveLayerIds={INTERACTIVE_LAYER_IDS}
      onClick={handleClick}
      onMouseEnter={() => setCursor("pointer")}
      onMouseLeave={() => setCursor("grab")}
    >
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
            "line-opacity": 0.7,
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
            "line-opacity": 0.95,
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
              "line-opacity": 0.55,
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
            "circle-opacity": 0.95,
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
            "circle-opacity": 0.7,
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
            "circle-opacity": 0.4,
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
