"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";

export interface MapData<T> {
  /** The last value fetched, or null before the first one arrives. */
  data: T | null;
  loading: boolean;
  error: boolean;
  /** Re-runs the request for the same url. */
  retry: () => void;
}

/**
 * Loads one JSON artifact for a map, with a real loading and error state.
 *
 * The outcome is stored against the request it belongs to rather than
 * cleared at the top of the effect: changing the url or pressing retry
 * makes the previous outcome stale by construction, so nothing has to
 * reset state during render or synchronously inside the effect body.
 */
export function useMapData<T>(url: string): MapData<T> {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<T | null>(null);
  const [outcome, setOutcome] = useState<{
    key: string;
    failed: boolean;
  } | null>(null);

  // A space cannot appear in these urls, so the two parts cannot collide.
  const key = `${attempt} ${url}`;

  useEffect(() => {
    let cancelled = false;
    fetchJson<T>(url)
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setOutcome({ key, failed: false });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // Logged as well as surfaced: the message names the url and status.
        console.error(cause);
        setOutcome({ key, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [url, key]);

  const settled = outcome && outcome.key === key ? outcome : null;

  return {
    data,
    loading: settled === null,
    error: settled?.failed ?? false,
    retry: () => setAttempt((n) => n + 1),
  };
}
