"use client";

import { useEffect, useState } from "react";
import { Map, Source, Layer, type MapMouseEvent } from "react-map-gl/maplibre";
import type { Feature, FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  OPENFREEMAP_STYLE,
  pickedFillColor,
  pickedFillOpacity,
  pickedOutlineWidth,
} from "@/lib/map-style";
import { hoveredCountry } from "@/lib/map-click";
import { geojsonBounds } from "@/lib/geo";

const FILL_LAYER = "picker-fill";

/**
 * A small map for choosing countries to compare.
 *
 * Deliberately limited: no zoom, no pan, no time slider. It exists so you
 * can point at a country instead of reading its name off a list, and the
 * main map remains the place to explore.
 */
export default function CountryPickerMap({
  picked,
  onToggle,
  disabled = false,
}: {
  picked: string[];
  onToggle: (code: string) => void;
  /** True once the comparison is full: further countries cannot be added. */
  disabled?: boolean;
}) {
  const [outlines, setOutlines] = useState<FeatureCollection | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/geo/countries.geojson")
      .then((r) => r.json())
      .then((fc: FeatureCollection) => {
        if (!cancelled) setOutlines(fc);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, []);

  const bounds = outlines ? geojsonBounds(outlines) : null;

  function handleClick(e: MapMouseEvent) {
    const code = hoveredCountry((e.features ?? []) as Feature[]);
    // A picked country can always be clicked again to remove it, even when
    // the comparison is full. Only adding is blocked.
    if (code && (!disabled || picked.includes(code))) onToggle(code);
  }

  return (
    <div className="h-64 w-full overflow-hidden rounded-xl border border-neutral-200">
      <Map
        key={bounds ? bounds.join(",") : "loading"}
        initialViewState={
          bounds
            ? { bounds, fitBoundsOptions: { padding: 24 } }
            : { longitude: 24.97, latitude: 45.9, zoom: 4.4 }
        }
        style={{ width: "100%", height: "100%" }}
        mapStyle={OPENFREEMAP_STYLE}
        attributionControl={{ compact: true }}
        scrollZoom={false}
        dragRotate={false}
        cursor={hovered ? "pointer" : "default"}
        interactiveLayerIds={outlines ? [FILL_LAYER] : []}
        onClick={handleClick}
        onMouseMove={(e) => {
          // mousemove fires continuously; bail out when nothing changed or
          // every pointer movement repaints the fill expression.
          const code = hoveredCountry((e.features ?? []) as Feature[]);
          setHovered((current) => (current === code ? current : code));
        }}
        onMouseLeave={() => setHovered(null)}
      >
        {outlines && (
          <Source id="picker-countries" type="geojson" data={outlines}>
            <Layer
              id={FILL_LAYER}
              type="fill"
              paint={{
                "fill-color": pickedFillColor(picked),
                "fill-opacity": pickedFillOpacity(picked, hovered),
              }}
            />
            <Layer
              id="picker-outline"
              type="line"
              paint={{
                "line-color": "#0f172a",
                "line-width": pickedOutlineWidth(picked),
                "line-opacity": 0.6,
              }}
            />
          </Source>
        )}
      </Map>
    </div>
  );
}
