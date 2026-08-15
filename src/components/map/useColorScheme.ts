"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the reader's OS asks for a dark interface.
 *
 * Only the map needs this. Everything else themes itself through the CSS
 * custom properties in globals.css and needs no JavaScript at all; MapLibre
 * paint values never see a custom property, so the canvas has to be told.
 *
 * `useSyncExternalStore` rather than an effect: the server snapshot is
 * `false`, which matches the light palette the static HTML is generated
 * with, so the first client render agrees with the markup and a dark-mode
 * reader gets one repaint rather than a hydration mismatch.
 */
const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/** Static generation has no preference to read, so it renders light. */
function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
