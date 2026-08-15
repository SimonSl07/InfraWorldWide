"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Map, type MapMouseEvent } from "react-map-gl/maplibre";
import { useTranslations } from "next-intl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { basemapUrl, defaultBasemapId } from "@/lib/basemaps";
import { usePrefersDark } from "./useColorScheme";
import { mapLocale } from "@/lib/map-locale";
import { geojsonBounds } from "@/lib/geo";
import MapStatus from "./MapStatus";
import { useMapData } from "./useMapData";

/* ── The shared frame ─────────────────────────────────────────────────── */

/** Camera used until the geometry arrives, and if it carries none. */
export interface FallbackView {
  longitude: number;
  latitude: number;
  zoom: number;
}

export interface StaticGeoMapProps {
  /** GeoJSON artifact to fetch and fit the camera to. */
  url: string;
  /** Tailwind height for the frame, for example "h-80". */
  heightClass: string;
  /** fitBounds padding in px, applied once the bounds are known. */
  padding: number;
  fallback: FallbackView;
  /** Layers, mounted only once the data is there. */
  children: (data: FeatureCollection) => ReactNode;
  /** MapLibre controls, mounted from the start. */
  controls?: ReactNode;
  /** Drawn over the top-left of the frame: the legend, in practice. */
  overlay?: ReactNode;
  scrollZoom?: boolean;
  dragRotate?: boolean;
  cursor?: string;
  /**
   * Layers that answer clicks. Ignored until the data loads, because
   * MapLibre errors on an interactive layer that is not mounted.
   */
  interactiveLayerIds?: string[];
  onClick?: (e: MapMouseEvent) => void;
  onMouseMove?: (e: MapMouseEvent) => void;
  onMouseEnter?: (e: MapMouseEvent) => void;
  onMouseLeave?: (e: MapMouseEvent) => void;
}

/**
 * The frame the four mini-maps share: one GeoJSON fetch, a camera fitted to
 * it, the basemap, the tile-failure guard and the status footer.
 *
 * Each of them used to hand-roll all of that and they drifted apart doing
 * it. Only what genuinely differs is passed in: the layers, the height, the
 * padding, whether the user may pan, and which controls are mounted.
 */
export default function StaticGeoMap({
  url,
  heightClass,
  padding,
  fallback,
  children,
  controls,
  overlay,
  scrollZoom = false,
  dragRotate,
  cursor,
  interactiveLayerIds,
  onClick,
  onMouseMove,
  onMouseEnter,
  onMouseLeave,
}: StaticGeoMapProps) {
  const t = useTranslations();
  const { data, loading, error, retry } = useMapData<FeatureCollection>(url);
  const [tileError, setTileError] = useState(false);
  // A bright basemap inside a dark page is the most jarring part of a
  // half-themed interface, so the default follows the OS preference.
  const prefersDark = usePrefersDark();

  const bounds = useMemo(() => (data ? geojsonBounds(data) : null), [data]);
  const locale = useMemo(() => mapLocale(t), [t]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-line ${heightClass}`}
    >
      <Map
        // initialViewState is read once per map instance, so the camera only
        // picks up the fitted bounds if the map is rebuilt when they arrive.
        key={bounds ? bounds.join(",") : "loading"}
        initialViewState={
          bounds ? { bounds, fitBoundsOptions: { padding } } : fallback
        }
        style={{ width: "100%", height: "100%" }}
        mapStyle={basemapUrl(defaultBasemapId(prefersDark))}
        // MapLibre draws its own canvas name, zoom buttons and attribution
        // toggle from an internal English table. This patches it.
        locale={locale}
        attributionControl={{ compact: true }}
        scrollZoom={scrollZoom}
        dragRotate={dragRotate}
        cursor={cursor}
        interactiveLayerIds={data ? interactiveLayerIds : []}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        // A tile-provider outage otherwise leaves a blank grey box.
        onError={(e) => {
          console.error(e.error);
          setTileError(true);
        }}
      >
        {controls}
        {data && children(data)}
      </Map>
      {overlay && <div className="absolute left-2 top-2 z-10">{overlay}</div>}
      <MapStatus
        loading={loading && !tileError}
        error={error || tileError}
        onRetry={() => {
          setTileError(false);
          retry();
        }}
      />
    </div>
  );
}
