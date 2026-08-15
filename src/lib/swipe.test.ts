import { describe, it, expect } from "vitest";
import { clampSwipe, swipeClipPath, swipeFromPointer } from "./swipe";

describe("swipeFromPointer", () => {
  it("turns a pointer x into a fraction of the frame", () => {
    expect(swipeFromPointer(200, { left: 100, width: 400 })).toBeCloseTo(0.25);
    expect(swipeFromPointer(300, { left: 100, width: 400 })).toBeCloseTo(0.5);
  });

  it("clamps outside the frame rather than running off", () => {
    // Dragging the handle past the edge must park it at the edge, not
    // invert the panes.
    expect(swipeFromPointer(0, { left: 100, width: 400 })).toBe(0);
    expect(swipeFromPointer(9999, { left: 100, width: 400 })).toBe(1);
  });

  it("is 0 for a frame with no width, rather than NaN", () => {
    // A frame measured before layout has width 0; NaN would reach the DOM
    // as an invalid clip-path and hide the pane entirely.
    expect(swipeFromPointer(50, { left: 0, width: 0 })).toBe(0);
  });
});

describe("clampSwipe", () => {
  it("keeps the value inside the frame", () => {
    expect(clampSwipe(-1)).toBe(0);
    expect(clampSwipe(2)).toBe(1);
    expect(clampSwipe(0.42)).toBe(0.42);
  });

  it("rejects a non-finite value", () => {
    expect(clampSwipe(NaN)).toBe(0.5);
    expect(clampSwipe(Infinity)).toBe(1);
  });
});

describe("swipeClipPath", () => {
  it("shows the after pane to the right of the handle", () => {
    expect(swipeClipPath(0.25)).toBe("inset(0 0 0 25%)");
    expect(swipeClipPath(0)).toBe("inset(0 0 0 0%)");
  });

  it("hides the after pane entirely at the far right", () => {
    expect(swipeClipPath(1)).toBe("inset(0 0 0 100%)");
  });

  it("rounds, so dragging does not rewrite the style on every sub-pixel", () => {
    expect(swipeClipPath(0.123456)).toBe("inset(0 0 0 12.35%)");
  });
});
