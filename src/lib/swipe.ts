/**
 * Geometry for the before/after swipe.
 *
 * Two maps are stacked and the top one is clipped to the right of a handle,
 * so dragging the handle wipes between them. Kept out of the component
 * because the clamping is the part that goes wrong: an unclamped or
 * non-finite fraction reaches the DOM as an invalid clip-path, which does
 * not fail loudly, it simply hides the pane.
 */

/** Where the handle sits, as a fraction of the frame width. */
export type SwipePosition = number;

export function clampSwipe(value: number): SwipePosition {
  if (Number.isNaN(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/** The handle position implied by a pointer at `clientX` over the frame. */
export function swipeFromPointer(
  clientX: number,
  frame: { left: number; width: number },
): SwipePosition {
  if (frame.width <= 0) return 0;
  return clampSwipe((clientX - frame.left) / frame.width);
}

/**
 * The clip applied to the top ("after") pane, so it shows only to the right
 * of the handle and the bottom ("before") pane shows to the left.
 */
export function swipeClipPath(position: SwipePosition): string {
  const percent = Math.round(clampSwipe(position) * 10000) / 100;
  return `inset(0 0 0 ${percent}%)`;
}
