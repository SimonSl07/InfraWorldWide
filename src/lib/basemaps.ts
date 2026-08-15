import { OPENFREEMAP_STYLE } from "./map-style";

/**
 * The basemaps the map offers.
 *
 * Satellite imagery was the thing worth having here: on an infrastructure
 * map you can see from it whether the earthworks exist. It is not offered,
 * and the reason is licensing rather than effort. Every global,
 * high-resolution imagery layer either needs an API key this repo does not
 * have (Mapbox, Maxar, Google, Bing, Esri's premium tiers) or forbids the
 * use. The closest miss is EOX Sentinel-2 cloudless at 10 m: its 2016
 * mosaic is CC BY 4.0, but every year from 2018 on is CC BY-NC-SA, and a
 * non-commercial clause is not something a public site can rely on. The
 * only keyless public-domain imagery, NASA GIBS, is 250 m per pixel, which
 * cannot show a construction site.
 *
 * So this is a style switch, not an imagery switch. Every entry comes from
 * OpenFreeMap, which the footer already attributes, so adding one costs no
 * new licence obligation.
 */
export interface Basemap {
  id: string;
  url: string;
  /** Message key holding the human label. */
  labelKey: string;
  /** True when the style is dark, so overlays can invert against it. */
  dark: boolean;
}

const STYLE_HOST = "https://tiles.openfreemap.org/styles";

export const BASEMAPS: Basemap[] = [
  // The default is the existing constant itself, not a copy of its text.
  { id: "positron", url: OPENFREEMAP_STYLE, labelKey: "basemap.positron", dark: false },
  { id: "liberty", url: `${STYLE_HOST}/liberty`, labelKey: "basemap.liberty", dark: false },
  { id: "dark", url: `${STYLE_HOST}/dark`, labelKey: "basemap.dark", dark: true },
];

/** The style the map has always opened on. */
export const DEFAULT_BASEMAP_ID = "positron";

export function basemap(id: string | null | undefined): Basemap {
  return (
    BASEMAPS.find((m) => m.id === id) ??
    BASEMAPS.find((m) => m.id === DEFAULT_BASEMAP_ID)!
  );
}

export function basemapUrl(id: string | null | undefined): string {
  return basemap(id).url;
}

/**
 * Parse a ?bm= param. The default returns null so it never reaches the URL,
 * and an id outside the catalogue is dropped rather than passed through:
 * a style URL taken from a query string would let a link point the map at
 * any host at all.
 */
export function parseBasemapParam(raw: string | null): string | null {
  if (!raw || raw === DEFAULT_BASEMAP_ID) return null;
  return BASEMAPS.some((m) => m.id === raw) ? raw : null;
}

/**
 * Which basemap to open on when the reader has made no explicit choice.
 *
 * A dark interface with a bright basemap in the middle of it is the single
 * most jarring thing about a half-themed page, so the OS preference picks
 * the default. An explicit `?bm=` choice still wins over it.
 */
export function defaultBasemapId(prefersDark: boolean): string {
  return prefersDark ? "dark" : DEFAULT_BASEMAP_ID;
}
