"use client";

import { Source, Layer, ScaleControl } from "react-map-gl/maplibre";
import {
  MARKER_FILTER,
  OPENED_FILTER,
  UNOPENED_FILTER,
  categoryColorExpr,
  statusDashExpr,
} from "@/lib/map-style";
import { mapColorsFor } from "@/lib/map-theme";
import { usePrefersDark } from "./useColorScheme";
import MapLegend from "./MapLegend";
import StaticGeoMap from "./StaticGeoMap";

/**
 * Every mapped lot in one country, coloured by category and dashed by
 * status: the country page's establishing shot. Static, because panning and
 * zooming belong on /map. The scale bar stays, since the subject is
 * kilometres and there is no zoom control to read distance off instead.
 */
export default function CountryMiniMap({ country }: { country: string }) {
  // MapLibre paint values cannot read a CSS custom property, so the
  // canvas is told which palette to draw with.
  const prefersDark = usePrefersDark();
  const theme = mapColorsFor(prefersDark);
  return (
    <StaticGeoMap
      url={`/data/geo/${country}.geojson`}
      heightClass="h-80"
      padding={32}
      fallback={{ longitude: 24.97, latitude: 45.9, zoom: 5 }}
      controls={<ScaleControl position="bottom-left" unit="metric" />}
      overlay={<MapLegend />}
    >
      {(data) => (
        <Source id="country-lots" type="geojson" data={data}>
          <Layer
            id="country-lots-casing"
            type="line"
            paint={{
              "line-color": theme.casing,
              "line-width": 5,
              "line-opacity": 0.7,
            }}
            layout={{ "line-cap": "round" }}
          />
          {/* Unopened lots are dashed by status, matching the main map. */}
          <Layer
            id="country-lots-unopened"
            type="line"
            filter={UNOPENED_FILTER}
            paint={{
              "line-color": categoryColorExpr(undefined, theme.category),
              "line-width": 2.5,
              "line-dasharray": statusDashExpr(),
              "line-opacity": 0.75,
            }}
            layout={{ "line-cap": "butt" }}
          />
          <Layer
            id="country-lots-opened"
            type="line"
            filter={OPENED_FILTER}
            paint={{ "line-color": categoryColorExpr(undefined, theme.category), "line-width": 2.5 }}
            layout={{ "line-cap": "round" }}
          />
          {/* Bridges and tunnels are too short to see at country zoom. */}
          <Layer
            id="country-lots-points"
            type="circle"
            filter={MARKER_FILTER}
            paint={{
              "circle-color": categoryColorExpr(undefined, theme.category),
              "circle-radius": 4,
              "circle-stroke-color": theme.markerStroke,
              "circle-stroke-width": 1.5,
            }}
          />
        </Source>
      )}
    </StaticGeoMap>
  );
}
