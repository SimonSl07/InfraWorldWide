"use client";

import { useEffect, useState } from "react";
import { Map, Source, Layer } from "react-map-gl/maplibre";
import type { FeatureCollection } from "geojson";
import type { ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CATEGORY_COLORS, OPENFREEMAP_STYLE } from "@/lib/map-style";
import { geojsonBounds, type BBox } from "@/lib/geo";

/**
 * Every mapped lot in one country, coloured by category — the country
 * page's establishing shot. Static: panning and zooming belong on /map.
 */
export default function CountryMiniMap({ country }: { country: string }) {
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [bounds, setBounds] = useState<BBox | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/data/geo/${country}.geojson`)
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
  }, [country]);

  const colorExpr = [
    "match",
    ["get", "category"],
    ...Object.entries(CATEGORY_COLORS).flat(),
    "#6b7280",
  ] as unknown as ExpressionSpecification;

  return (
    <div className="h-80 w-full overflow-hidden rounded-xl border border-neutral-200">
      <Map
        key={bounds ? bounds.join(",") : "loading"}
        initialViewState={
          bounds
            ? { bounds, fitBoundsOptions: { padding: 32 } }
            : { longitude: 24.97, latitude: 45.9, zoom: 5 }
        }
        style={{ width: "100%", height: "100%" }}
        mapStyle={OPENFREEMAP_STYLE}
        attributionControl={{ compact: true }}
        scrollZoom={false}
      >
        {geojson && (
          <Source id="country-lots" type="geojson" data={geojson}>
            <Layer
              id="country-lots-casing"
              type="line"
              paint={{
                "line-color": "#ffffff",
                "line-width": 5,
                "line-opacity": 0.7,
              }}
              layout={{ "line-cap": "round" }}
            />
            <Layer
              id="country-lots-line"
              type="line"
              paint={{ "line-color": colorExpr, "line-width": 2.5 }}
              layout={{ "line-cap": "round" }}
            />
            {/* Bridges and tunnels are too short to see at country zoom. */}
            <Layer
              id="country-lots-points"
              type="circle"
              filter={["==", ["get", "marker"], true] as never}
              paint={{
                "circle-color": colorExpr,
                "circle-radius": 4,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.5,
              }}
            />
          </Source>
        )}
      </Map>
    </div>
  );
}
