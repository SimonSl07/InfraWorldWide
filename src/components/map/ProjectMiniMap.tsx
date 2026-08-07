"use client";

import { useEffect, useState } from "react";
import { Map, Source, Layer } from "react-map-gl/maplibre";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { CATEGORY_COLORS, OPENFREEMAP_STYLE } from "@/lib/map-style";
import { featuresForProject, geojsonBounds } from "@/lib/geo";
import type { Category } from "@/lib/schema";

interface ProjectMiniMapProps {
  country: string;
  projectId: string;
  category: Category;
}

export default function ProjectMiniMap({
  country,
  projectId,
  category,
}: ProjectMiniMapProps) {
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/data/geo/${country}.geojson`)
      .then((r) => r.json())
      .then((fc: FeatureCollection) => {
        if (cancelled) return;
        const features = featuresForProject(fc, projectId);
        const filtered: FeatureCollection = {
          type: "FeatureCollection",
          features,
        };
        setGeojson(filtered);
        setBounds(geojsonBounds(filtered));
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [country, projectId]);

  return (
    <div className="h-64 w-full overflow-hidden rounded-xl border border-neutral-200">
      <Map
        key={bounds ? bounds.join(",") : "loading"}
        initialViewState={
          bounds
            ? { bounds, fitBoundsOptions: { padding: 40 } }
            : { longitude: 24.97, latitude: 45.9, zoom: 5 }
        }
        style={{ width: "100%", height: "100%" }}
        mapStyle={OPENFREEMAP_STYLE}
        attributionControl={{ compact: true }}
        scrollZoom={false}
      >
        {geojson && (
          <Source id="project" type="geojson" data={geojson}>
            <Layer
              id="project-casing"
              type="line"
              paint={{ "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.7 }}
              layout={{ "line-cap": "round" }}
            />
            <Layer
              id="project-line"
              type="line"
              paint={{
                "line-color": CATEGORY_COLORS[category],
                "line-width": 4,
              }}
              layout={{ "line-cap": "round" }}
            />
          </Source>
        )}
      </Map>
    </div>
  );
}
