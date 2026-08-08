import { describe, it, expect } from "vitest";
import {
  SPEED_STEPS,
  DEFAULT_SPEED_INDEX,
  speedFromIndex,
  playbackTick,
  formatSpeed,
} from "./playback";

describe("SPEED_STEPS", () => {
  it("offers the months-per-second steps the timeline advertises", () => {
    expect([...SPEED_STEPS]).toEqual([1, 2, 3, 6, 12, 24, 48]);
  });
  it("defaults to a year of growth per second", () => {
    expect(SPEED_STEPS[DEFAULT_SPEED_INDEX]).toBe(12);
  });
});

describe("speedFromIndex", () => {
  it("maps indices to the speed steps", () => {
    expect(speedFromIndex(0)).toBe(1);
    expect(speedFromIndex(DEFAULT_SPEED_INDEX)).toBe(12);
    expect(speedFromIndex(SPEED_STEPS.length - 1)).toBe(48);
  });
  it("clamps out-of-range indices", () => {
    expect(speedFromIndex(-5)).toBe(1);
    expect(speedFromIndex(99)).toBe(48);
  });
});

describe("playbackTick", () => {
  it("advances one month per tick at the slower speeds", () => {
    expect(playbackTick(1)).toEqual({ stepMonths: 1, intervalMs: 1000 });
    expect(playbackTick(2)).toEqual({ stepMonths: 1, intervalMs: 500 });
    expect(playbackTick(3)).toEqual({ stepMonths: 1, intervalMs: 333 });
    expect(playbackTick(6)).toEqual({ stepMonths: 1, intervalMs: 167 });
    expect(playbackTick(12)).toEqual({ stepMonths: 1, intervalMs: 83 });
  });

  it("steps several months at once rather than firing an unusable timer", () => {
    // 24/s and 48/s would need 42ms and 21ms ticks; browsers throttle that
    // and the map cannot repaint fast enough.
    expect(playbackTick(24)).toEqual({ stepMonths: 2, intervalMs: 83 });
    expect(playbackTick(48)).toEqual({ stepMonths: 3, intervalMs: 63 });
  });

  it("delivers the requested months per second at every step", () => {
    for (const mps of SPEED_STEPS) {
      const { stepMonths, intervalMs } = playbackTick(mps);
      // intervalMs is whole milliseconds, so the delivered rate only
      // approximates the requested one — within half a month per second.
      expect((stepMonths * 1000) / intervalMs).toBeCloseTo(mps, 0);
    }
  });

  it("never ticks faster than 20 times a second", () => {
    for (const mps of SPEED_STEPS) {
      expect(playbackTick(mps).intervalMs).toBeGreaterThanOrEqual(50);
    }
  });

  it("falls back to the default speed for non-positive input", () => {
    expect(playbackTick(0)).toEqual(playbackTick(12));
    expect(playbackTick(-3)).toEqual(playbackTick(12));
  });
});

describe("formatSpeed", () => {
  it("prints the month count plainly", () => {
    expect(formatSpeed(1)).toBe("1");
    expect(formatSpeed(12)).toBe("12");
    expect(formatSpeed(48)).toBe("48");
  });
});
