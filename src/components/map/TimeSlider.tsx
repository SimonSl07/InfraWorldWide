"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  SPEED_STEPS,
  formatSpeed,
  playbackTick,
  speedFromIndex,
} from "@/lib/playback";
import { fromMonthIndex } from "@/lib/map-filters";
import { formatMonth } from "@/lib/format";

interface TimeSliderProps {
  /** Absolute month index (year*12 + month-1). */
  month: number;
  min: number;
  max: number;
  playing: boolean;
  locale: string;
  /** Index into SPEED_STEPS. */
  speedIndex: number;
  onMonthChange: (month: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedIndexChange: (index: number) => void;
}

export default function TimeSlider({
  month,
  min,
  max,
  playing,
  locale,
  speedIndex,
  onMonthChange,
  onPlayingChange,
  onSpeedIndexChange,
}: TimeSliderProps) {
  const t = useTranslations("map");
  const speed = speedFromIndex(speedIndex);

  // The tick reads the current month and callback through refs so neither is
  // an effect dependency. Listing `month` tore the interval down and rebuilt
  // it on every advance, degenerating into a drifting chain of timeouts.
  // The refs are written in an effect, not during render.
  const monthRef = useRef(month);
  const onMonthChangeRef = useRef(onMonthChange);

  useEffect(() => {
    monthRef.current = month;
    onMonthChangeRef.current = onMonthChange;
  }, [month, onMonthChange]);

  useEffect(() => {
    if (!playing) return;

    const { stepMonths, intervalMs } = playbackTick(speed);
    const id = setInterval(() => {
      const current = monthRef.current;
      // Land exactly on `max` before wrapping, so the last month is never
      // skipped by a multi-month step.
      onMonthChangeRef.current(
        current >= max ? min : Math.min(max, current + stepMonths),
      );
    }, intervalMs);
    return () => clearInterval(id);
  }, [playing, min, max, speed]);

  const label = formatMonth(month, locale);
  const bound = (i: number) => String(fromMonthIndex(i).year);

  return (
    // Below `sm` the speed control drops to a second line rather than pushing
    // the whole bar past the viewport, which is what clipped it on a phone.
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 bg-surface/95 backdrop-blur rounded-xl shadow-lg px-3 py-3 sm:px-4 border border-line">
      <button
        type="button"
        onClick={() => onPlayingChange(!playing)}
        aria-label={playing ? t("pause") : t("play")}
        className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-full bg-inverse text-on-inverse hover:bg-inverse-soft shrink-0"
      >
        {/* Drawn, not typed: the play and pause characters render as emoji
            on some platforms and as text glyphs on others. */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          {playing ? (
            <>
              <rect x="3" y="2.5" width="3.5" height="11" rx="0.75" />
              <rect x="9.5" y="2.5" width="3.5" height="11" rx="0.75" />
            </>
          ) : (
            <path d="M4.5 2.5v11l9-5.5z" />
          )}
        </svg>
      </button>

      <div className="flex flex-col gap-1 min-w-0 flex-1 sm:flex-none">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={month}
          onChange={(e) => onMonthChange(Number(e.target.value))}
          className="w-full sm:w-64 md:w-96 accent-inverse"
          aria-label={t("month")}
          aria-valuetext={label}
        />
        <div className="flex justify-between text-[10px] text-ink-muted">
          <span>{bound(min)}</span>
          <span>{bound(max)}</span>
        </div>
      </div>

      <div className="text-base sm:text-lg font-bold tabular-nums w-24 sm:w-28 text-center shrink-0">
        {label}
      </div>

      {/* playback speed, in months advanced per second */}
      <div className="flex flex-col gap-1 shrink-0 sm:border-l sm:border-line sm:pl-3">
        <input
          type="range"
          min={0}
          max={SPEED_STEPS.length - 1}
          step={1}
          value={speedIndex}
          onChange={(e) => onSpeedIndexChange(Number(e.target.value))}
          className="w-20 sm:w-24 accent-inverse"
          aria-label={t("speed")}
          title={t("speedValue", { speed: formatSpeed(speed) })}
        />
        <div className="text-[10px] text-ink-muted text-center tabular-nums">
          {t("speedValue", { speed: formatSpeed(speed) })}
        </div>
      </div>
    </div>
  );
}
