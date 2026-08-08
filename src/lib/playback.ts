/**
 * Time-slider playback.
 *
 * The timeline advances one calendar month at a time, always landing on the
 * first of the month: after 1 July 2015 the next point in time is 1 August
 * 2015. Speeds are expressed in months advanced per second.
 */

/** Playback speeds, in months advanced per second. */
export const SPEED_STEPS = [1, 2, 3, 6, 12, 24, 48] as const;

/** Default: 12 months per second — a year of network growth every second. */
export const DEFAULT_SPEED_INDEX = 4;

/** Speed for a slider index, clamped to the available steps. */
export function speedFromIndex(index: number): number {
  const i = Math.max(0, Math.min(SPEED_STEPS.length - 1, Math.round(index)));
  return SPEED_STEPS[i];
}

/** Never tick faster than this — beyond it the map cannot keep up anyway. */
const MAX_TICKS_PER_SECOND = 20;

export interface PlaybackTick {
  /** Months to advance on each tick. */
  stepMonths: number;
  /** Delay between ticks, in milliseconds. */
  intervalMs: number;
}

/**
 * Timer shape for a speed.
 *
 * At the slower speeds this is one month per tick. Faster than
 * MAX_TICKS_PER_SECOND it advances several months per tick instead of
 * firing a timer every few milliseconds, which browsers throttle and which
 * would re-render the map faster than it can paint. The product of step and
 * rate always equals the requested months per second.
 */
export function playbackTick(monthsPerSecond: number): PlaybackTick {
  const mps =
    monthsPerSecond > 0 ? monthsPerSecond : SPEED_STEPS[DEFAULT_SPEED_INDEX];
  const stepMonths = Math.max(1, Math.ceil(mps / MAX_TICKS_PER_SECOND));
  return { stepMonths, intervalMs: Math.round((1000 * stepMonths) / mps) };
}

/** Compact label for a speed, e.g. "1" / "12" / "48". */
export function formatSpeed(monthsPerSecond: number): string {
  return String(monthsPerSecond);
}
