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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speed = speedFromIndex(speedIndex);

  useEffect(() => {
    if (!playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const { stepMonths, intervalMs } = playbackTick(speed);
    intervalRef.current = setInterval(() => {
      // Land exactly on `max` before wrapping, so the last month is never
      // skipped by a multi-month step.
      onMonthChange(month >= max ? min : Math.min(max, month + stepMonths));
    }, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, month, min, max, speed, onMonthChange]);

  const label = formatMonth(month, locale);
  const bound = (i: number) => String(fromMonthIndex(i).year);

  return (
    <div className="flex items-center gap-3 bg-white/95 backdrop-blur rounded-xl shadow-lg px-4 py-3 border border-neutral-200">
      <button
        onClick={() => onPlayingChange(!playing)}
        aria-label={playing ? t("pause") : t("play")}
        className="w-9 h-9 flex items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-700 shrink-0"
      >
        {playing ? "⏸" : "▶"}
      </button>

      <div className="flex flex-col gap-1 min-w-0">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={month}
          onChange={(e) => onMonthChange(Number(e.target.value))}
          className="w-40 sm:w-64 md:w-96 accent-neutral-900"
          aria-label={t("month")}
          aria-valuetext={label}
        />
        <div className="flex justify-between text-[10px] text-neutral-400">
          <span>{bound(min)}</span>
          <span>{bound(max)}</span>
        </div>
      </div>

      <div className="text-lg font-bold tabular-nums w-28 text-center shrink-0">
        {label}
      </div>

      {/* playback speed, in months advanced per second */}
      <div className="flex flex-col gap-1 shrink-0 border-l border-neutral-200 pl-3">
        <input
          type="range"
          min={0}
          max={SPEED_STEPS.length - 1}
          step={1}
          value={speedIndex}
          onChange={(e) => onSpeedIndexChange(Number(e.target.value))}
          className="w-20 sm:w-24 accent-neutral-900"
          aria-label={t("speed")}
          title={t("speedValue", { speed: formatSpeed(speed) })}
        />
        <div className="text-[10px] text-neutral-500 text-center tabular-nums">
          {t("speedValue", { speed: formatSpeed(speed) })}
        </div>
      </div>
    </div>
  );
}
