"use client";

import { useState } from "react";
import { Source, Layer, type MapMouseEvent } from "react-map-gl/maplibre";
import type { Feature } from "geojson";
import {
  pickedFillColor,
  pickedFillOpacity,
  pickedOutlineWidth,
} from "@/lib/map-style";
import { hoveredCountry } from "@/lib/map-click";
import StaticGeoMap from "./map/StaticGeoMap";

const FILL_LAYER = "picker-fill";

/**
 * A small map for choosing countries to compare.
 *
 * Deliberately limited: no zoom, no rotation, no time slider, and no map
 * controls either. It exists so you can point at a country instead of
 * reading its name off a list, and the main map remains the place to
 * explore. Nothing is drawn here but outlines, so there is no legend.
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
  const [hovered, setHovered] = useState<string | null>(null);

  function handleClick(e: MapMouseEvent) {
    const code = hoveredCountry((e.features ?? []) as Feature[]);
    // A picked country can always be clicked again to remove it, even when
    // the comparison is full. Only adding is blocked.
    if (code && (!disabled || picked.includes(code))) onToggle(code);
  }

  return (
    <StaticGeoMap
      url="/data/geo/countries.geojson"
      heightClass="h-64"
      padding={24}
      fallback={{ longitude: 24.97, latitude: 45.9, zoom: 4.4 }}
      dragRotate={false}
      cursor={hovered ? "pointer" : "default"}
      interactiveLayerIds={[FILL_LAYER]}
      onClick={handleClick}
      onMouseMove={(e) => {
        // mousemove fires continuously; bail out when nothing changed or
        // every pointer movement repaints the fill expression.
        const code = hoveredCountry((e.features ?? []) as Feature[]);
        setHovered((current) => (current === code ? current : code));
      }}
      onMouseLeave={() => setHovered(null)}
    >
      {(outlines) => (
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
    </StaticGeoMap>
  );
}
