"use client";

import { Source, Layer, ScaleControl } from "react-map-gl/maplibre";
import {
  OPENED_FILTER,
  UNOPENED_FILTER,
  statusDashExpr,
} from "@/lib/map-style";
import { mapColorsFor } from "@/lib/map-theme";
import { usePrefersDark } from "./useColorScheme";
import type { Category } from "@/lib/schema";
import MapLegend from "./MapLegend";
import StaticGeoMap from "./StaticGeoMap";

interface ProjectMiniMapProps {
  /**
   * Accepted for callers that still pass it. The geometry now comes from
   * the project's own file, so the country is no longer needed to find it.
   */
  country?: string;
  projectId: string;
  category: Category;
}

/**
 * One project, drawn on its own. Every lot here shares a category, so the
 * colour is fixed rather than matched per feature, and only the status dash
 * varies: which sections are open and which are still to come is the whole
 * question this map answers.
 */
export default function ProjectMiniMap({
  projectId,
  category,
}: ProjectMiniMapProps) {
  // MapLibre paint values cannot read a CSS custom property, so the
  // canvas is told which palette to draw with.
  const prefersDark = usePrefersDark();
  const theme = mapColorsFor(prefersDark);
  const color = theme.category[category];

  // One file per project. Filtering the country file used to draw nothing
  // at all for a city-scoped project, since those are deliberately absent
  // from it: that is why every metro line rendered as a bare basemap.
  return (
    <StaticGeoMap
      url={`/data/geo/projects/${projectId}.geojson`}
      heightClass="h-64"
      padding={40}
      fallback={{ longitude: 24.97, latitude: 45.9, zoom: 5 }}
      controls={<ScaleControl position="bottom-left" unit="metric" />}
      overlay={<MapLegend categories={[category]} />}
    >
      {(data) => (
        <Source id="project" type="geojson" data={data}>
          <Layer
            id="project-casing"
            type="line"
            paint={{
              "line-color": theme.casing,
              "line-width": 7,
              "line-opacity": 0.7,
            }}
            layout={{ "line-cap": "round" }}
          />
          <Layer
            id="project-unopened"
            type="line"
            filter={UNOPENED_FILTER}
            paint={{
              "line-color": color,
              "line-width": 4,
              "line-dasharray": statusDashExpr(),
              "line-opacity": 0.8,
            }}
            layout={{ "line-cap": "butt" }}
          />
          <Layer
            id="project-opened"
            type="line"
            filter={OPENED_FILTER}
            paint={{ "line-color": color, "line-width": 4 }}
            layout={{ "line-cap": "round" }}
          />
        </Source>
      )}
    </StaticGeoMap>
  );
}
