"use client";

import { useState } from "react";
import {
  Source,
  Layer,
  NavigationControl,
  ScaleControl,
  FullscreenControl,
  type MapMouseEvent,
} from "react-map-gl/maplibre";
import type { Feature } from "geojson";
import type { FilterSpecification } from "maplibre-gl";
import {
  MARKER_FILTER,
  OPENED_FILTER,
  UNOPENED_FILTER,
  categoryColorExpr,
  dimByProject,
  projectFilter,
  statusDashExpr,
} from "@/lib/map-style";
import { mapColorsFor } from "@/lib/map-theme";
import { usePrefersDark } from "./useColorScheme";
import { resolveMapClick, toggleSelection } from "@/lib/map-click";
import MapLegend from "./MapLegend";
import StaticGeoMap from "./StaticGeoMap";

/** Width of the invisible click target around each line (px). */
const HIT_WIDTH = 24;

const HIT_LAYER = "city-lots-hit";

/**
 * A city's own network, and nothing else.
 *
 * This is the only place these projects are drawn: they are excluded from
 * the main map, where a metro line at country zoom sits on top of the
 * motorway network as a few pixels of noise. Panning and zooming are on,
 * unlike the country mini-map, because at city scale the individual
 * stations are the point. That is also why this map gets zoom buttons and a
 * fullscreen toggle, which the static mini-maps have no use for.
 *
 * Lines are clickable. Selecting one fades the others and tells the page,
 * which highlights the matching card in the list below.
 */
export default function CityMiniMap({
  cityKey,
  selectedProjectId,
  onSelectProject,
}: {
  cityKey: string;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
}) {
  const [cursor, setCursor] = useState<"grab" | "pointer">("grab");
  // MapLibre paint values cannot read a CSS custom property, so the
  // canvas is told which palette to draw with.
  const prefersDark = usePrefersDark();
  const theme = mapColorsFor(prefersDark);

  const dim = (full: number) => dimByProject(full, selectedProjectId);

  /** No country outlines here, so a click is either a lot or empty map. */
  function handleClick(e: MapMouseEvent) {
    const hit = resolveMapClick((e.features ?? []) as Feature[], [
      e.lngLat.lng,
      e.lngLat.lat,
    ]);
    if (hit.kind !== "lot") {
      onSelectProject(null);
      return;
    }
    const projectId = hit.feature.properties?.projectId as string | undefined;
    if (!projectId) return;
    onSelectProject(toggleSelection(selectedProjectId, projectId));
  }

  return (
    <StaticGeoMap
      url={`/data/geo/cities/${cityKey}.geojson`}
      heightClass="h-[28rem]"
      padding={40}
      fallback={{ longitude: 26.1, latitude: 44.43, zoom: 10 }}
      scrollZoom
      cursor={cursor}
      interactiveLayerIds={[HIT_LAYER]}
      onClick={handleClick}
      onMouseEnter={() => setCursor("pointer")}
      onMouseLeave={() => setCursor("grab")}
      controls={
        <>
          {/* No compass: rotation is off the table on a map this small. */}
          <NavigationControl position="top-right" showCompass={false} />
          <FullscreenControl position="top-right" />
          <ScaleControl position="bottom-left" unit="metric" />
        </>
      }
      overlay={<MapLegend />}
    >
      {(geojson) => (
        <Source id="city-lots" type="geojson" data={geojson}>
          {/* Highlight sits under the lines so it reads as a glow around
              them rather than a stripe over them. */}
          {selectedProjectId && (
            <Layer
              id="city-lots-selected"
              type="line"
              filter={projectFilter(selectedProjectId) as FilterSpecification}
              paint={{
                "line-color": theme.selectedHighlight,
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 9, 14, 20],
                "line-opacity": 0.55,
              }}
              layout={{ "line-cap": "round" }}
            />
          )}
          <Layer
            id="city-lots-casing"
            type="line"
            paint={{
              "line-color": theme.casing,
              "line-width": ["interpolate", ["linear"], ["zoom"], 9, 5, 14, 11],
              "line-opacity": dim(0.8),
            }}
            layout={{ "line-cap": "round" }}
          />
          {/* Unopened sections are dashed by status, matching the main
              map's vocabulary so the two read the same way. */}
          <Layer
            id="city-lots-planned"
            type="line"
            filter={UNOPENED_FILTER}
            paint={{
              "line-color": categoryColorExpr(undefined, theme.category),
              "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 6],
              "line-dasharray": statusDashExpr(),
              "line-opacity": dim(0.6),
            }}
            layout={{ "line-cap": "butt" }}
          />
          <Layer
            id="city-lots-opened"
            type="line"
            filter={OPENED_FILTER}
            paint={{
              "line-color": categoryColorExpr(undefined, theme.category),
              "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 8],
              "line-opacity": dim(0.95),
            }}
            layout={{ "line-cap": "round" }}
          />
          {/* Bridges and tunnels get a midpoint marker in the data build. */}
          <Layer
            id="city-lots-points"
            type="circle"
            filter={MARKER_FILTER}
            paint={{
              "circle-color": categoryColorExpr(undefined, theme.category),
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 8],
              "circle-stroke-color": theme.markerStroke,
              "circle-stroke-width": 1.5,
              "circle-opacity": dim(0.95),
            }}
          />
          {/* Invisible fat hit area, mounted last so it is on top. An
              opacity-0 layer stays queryable; visibility:none would not. */}
          <Layer
            id={HIT_LAYER}
            type="line"
            paint={{
              "line-color": theme.markerStroke,
              "line-width": HIT_WIDTH,
              "line-opacity": 0.01,
            }}
          />
        </Source>
      )}
    </StaticGeoMap>
  );
}
