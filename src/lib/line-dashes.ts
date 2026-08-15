import type { ExpressionSpecification } from "maplibre-gl";

/**
 * Dash patterns for the main map's line layers.
 *
 * `line-dasharray` is `cross-faded-data-driven` in MapLibre 5, which means
 * the value is parsed as an expression. A bare `[3, 2.2]` is therefore read
 * as a call to an operator named `3`, rejected, and the property dropped:
 * the layer renders solid with no error a reader would notice. Wrapping the
 * pattern in `["literal", ...]` is what makes it a constant array again.
 *
 * The per-status patterns live in map-style.ts as `STATUS_DASHES`. These
 * three are per-layer rather than per-status, which is why they are here.
 */
export function dashArray(pattern: number[]): ExpressionSpecification {
  return ["literal", pattern] as unknown as ExpressionSpecification;
}

/** Building sites: a long dash, the most emphatic of the three. */
export const UNDER_CONSTRUCTION_DASH = dashArray([3, 2.2]);

/** Not yet started: a fine dash, so it reads as an intention. */
export const FUTURE_DASH = dashArray([1, 2]);

/**
 * The white overprint marking track that is open only on a projected date.
 * Tighter than the others so it reads as hatching rather than a dashed line.
 */
export const PROJECTED_HATCH_DASH = dashArray([1.2, 1.6]);
