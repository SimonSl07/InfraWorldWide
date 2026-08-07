/** Time-slider playback speeds, in years advanced per second. */
export const SPEED_STEPS = [0.5, 1, 2, 4, 8, 16] as const;

/** Default: one year per second. */
export const DEFAULT_SPEED_INDEX = 1;

/** Speed for a slider index, clamped to the available steps. */
export function speedFromIndex(index: number): number {
  const i = Math.max(0, Math.min(SPEED_STEPS.length - 1, Math.round(index)));
  return SPEED_STEPS[i];
}

/** Tick delay for a playback speed (years per second). */
export function intervalMsForSpeed(yearsPerSecond: number): number {
  const safe = yearsPerSecond > 0 ? yearsPerSecond : SPEED_STEPS[DEFAULT_SPEED_INDEX];
  return Math.round(1000 / safe);
}

/** Compact label for a speed, e.g. "0.5" / "2" / "16". */
export function formatSpeed(yearsPerSecond: number): string {
  return Number.isInteger(yearsPerSecond)
    ? String(yearsPerSecond)
    : yearsPerSecond.toFixed(1);
}
