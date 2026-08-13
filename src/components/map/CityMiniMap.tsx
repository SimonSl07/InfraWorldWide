"use client";

import { useEffect, useState } from "react";
import { Map, Source, Layer, type MapMouseEvent } from "react-map-gl/maplibre";
import type { Feature, FeatureCollection } from "geojson";
import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  CATEGORY_COLORS,
  OPENFREEMAP_STYLE,
  dimByProject,
  projectFilter,
} from "@/lib/map-style";
import { resolveMapClick, toggleSelection } from "@/lib/map-click";
import { geojsonBounds, type BBox } from "@/lib/geo";

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
 * stations are the point.
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
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [bounds, setBounds] = useState<BBox | null>(null);
  const [cursor, setCursor] = useState<"grab" | "pointer">("grab");

  useEffect(() => {
    let cancelled = false;
    fetch(`/data/geo/cities/${cityKey}.geojson`)
      .then((r) => r.json())
      .then((fc: FeatureCollection) => {
        if (cancelled) return;
        setGeojson(fc);
        setBounds(geojsonBounds(fc));
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [cityKey]);

  const colorExpr = [
    "match",
    ["get", "category"],
    ...Object.entries(CATEGORY_COLORS).flat(),
    "#6b7280",
  ] as unknown as ExpressionSpecification;

  const opened = ["==", ["get", "status"], "opened"] as unknown as FilterSpecification;
  const unopened = ["!=", ["get", "status"], "opened"] as unknown as FilterSpecification;

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
    <div className="h-[28rem] w-full overflow-hidden rounded-xl border border-neutral-200">
      <Map
        key={bounds ? bounds.join(",") : "loading"}
        initialViewState={
          bounds
            ? { bounds, fitBoundsOptions: { padding: 40 } }
            : { longitude: 26.1, latitude: 44.43, zoom: 10 }
        }
        style={{ width: "100%", height: "100%" }}
        mapStyle={OPENFREEMAP_STYLE}
        attributionControl={{ compact: true }}
        cursor={cursor}
        interactiveLayerIds={geojson ? [HIT_LAYER] : []}
        onClick={handleClick}
        onMouseEnter={() => setCursor("pointer")}
        onMouseLeave={() => setCursor("grab")}
      >
        {geojson && (
          <Source id="city-lots" type="geojson" data={geojson}>
            {/* Highlight sits under the lines so it reads as a glow around
                them rather than a stripe over them. */}
            {selectedProjectId && (
              <Layer
                id="city-lots-selected"
                type="line"
                filter={projectFilter(selectedProjectId) as FilterSpecification}
                paint={{
                  "line-color": "#facc15", // yellow-400
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
                "line-color": "#ffffff",
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 5, 14, 11],
                "line-opacity": dim(0.8),
              }}
              layout={{ "line-cap": "round" }}
            />
            {/* Unopened sections are dashed, matching the main map's
                vocabulary so the two read the same way. */}
            <Layer
              id="city-lots-planned"
              type="line"
              filter={unopened}
              paint={{
                "line-color": colorExpr,
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 6],
                "line-dasharray": [2, 2],
                "line-opacity": dim(0.6),
              }}
              layout={{ "line-cap": "butt" }}
            />
            <Layer
              id="city-lots-opened"
              type="line"
              filter={opened}
              paint={{
                "line-color": colorExpr,
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 8],
                "line-opacity": dim(0.95),
              }}
              layout={{ "line-cap": "round" }}
            />
            {/* Bridges and tunnels get a midpoint marker in the data build. */}
            <Layer
              id="city-lots-points"
              type="circle"
              filter={["==", ["get", "marker"], true] as never}
              paint={{
                "circle-color": colorExpr,
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 8],
                "circle-stroke-color": "#ffffff",
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
                "line-color": "#000000",
                "line-width": HIT_WIDTH,
                "line-opacity": 0.01,
              }}
            />
          </Source>
        )}
      </Map>
    </div>
  );
}
