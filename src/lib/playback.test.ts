import { describe, it, expect } from "vitest";
import {
  SPEED_STEPS,
  DEFAULT_SPEED_INDEX,
  speedFromIndex,
  intervalMsForSpeed,
  formatSpeed,
} from "./playback";

describe("speedFromIndex", () => {
  it("maps indices to the speed steps", () => {
    expect(speedFromIndex(0)).toBe(SPEED_STEPS[0]);
    expect(speedFromIndex(DEFAULT_SPEED_INDEX)).toBe(1);
    expect(speedFromIndex(SPEED_STEPS.length - 1)).toBe(16);
  });
  it("clamps out-of-range indices", () => {
    expect(speedFromIndex(-5)).toBe(SPEED_STEPS[0]);
    expect(speedFromIndex(99)).toBe(SPEED_STEPS[SPEED_STEPS.length - 1]);
  });
});

describe("intervalMsForSpeed", () => {
  it("converts years-per-second to a tick delay", () => {
    expect(intervalMsForSpeed(1)).toBe(1000);
    expect(intervalMsForSpeed(2)).toBe(500);
    expect(intervalMsForSpeed(0.5)).toBe(2000);
    expect(intervalMsForSpeed(16)).toBe(63);
  });
  it("falls back to the default speed for non-positive input", () => {
    expect(intervalMsForSpeed(0)).toBe(1000);
    expect(intervalMsForSpeed(-3)).toBe(1000);
  });
});

describe("formatSpeed", () => {
  it("prints integers plainly and fractions with one decimal", () => {
    expect(formatSpeed(1)).toBe("1");
    expect(formatSpeed(16)).toBe("16");
    expect(formatSpeed(0.5)).toBe("0.5");
  });
});
