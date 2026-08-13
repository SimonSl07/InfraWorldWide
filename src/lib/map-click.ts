import type { Feature, Position } from "geojson";
import { nearestFeature } from "./geo";

/**
 * Resolving what a click on the map meant.
 *
 * Kept out of the component because the decision is genuinely fiddly — the
 * country fill spans the entire map, so every click on a road also hits a
 * country — and because it cannot be exercised in a headless browser:
 * queryRenderedFeatures only sees features the map has actually drawn.
 */

export type MapClick =
  | { kind: "lot"; feature: Feature }
  | { kind: "country"; code: string }
  | { kind: "none" };

/** Lot features carry a lotId; country outlines carry only a country code. */
function isLot(feature: Feature): boolean {
  return feature.properties?.lotId != null;
}

/**
 * What a click hit, given everything under the pointer.
 *
 * Lots take precedence over countries: the country fill lies under every
 * road, so resolving by topmost layer or by proximity alone would make the
 * roads unclickable. Among overlapping lots the nearest to the click point
 * wins, since their hit areas are 30px wide and routinely overlap.
 *
 * Cities are absent from this decision on purpose. Their markers are DOM
 * elements rather than map layers, so a click on one is handled by the
 * marker itself and never reaches the map.
 */
export function resolveMapClick(
  features: Feature[],
  point: Position,
): MapClick {
  const lots = features.filter(isLot);
  if (lots.length > 0) {
    const best = lots.length === 1 ? lots[0] : nearestFeature(lots, point);
    if (best) return { kind: "lot", feature: best };
  }

  const country = features.find(
    (f) => !isLot(f) && typeof f.properties?.country === "string",
  );
  if (country) {
    return { kind: "country", code: country.properties!.country as string };
  }

  return { kind: "none" };
}

/**
 * The next selection after a click.
 *
 * Clicking the already-selected thing clears it, which on the city map is
 * the only comfortable way to reset: two metro lines can leave very little
 * empty space to click between them.
 */
export function toggleSelection(
  current: string | null,
  clicked: string | null,
): string | null {
  if (clicked === null) return null;
  return clicked === current ? null : clicked;
}

/** The country under the pointer, for the hover tint. Null over a road or sea. */
export function hoveredCountry(features: Feature[]): string | null {
  const hit = features.find(
    (f) => !isLot(f) && typeof f.properties?.country === "string",
  );
  return hit ? (hit.properties!.country as string) : null;
}
