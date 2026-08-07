"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  SPEED_STEPS,
  formatSpeed,
  intervalMsForSpeed,
  speedFromIndex,
} from "@/lib/playback";

interface TimeSliderProps {
  year: number;
  min: number;
  max: number;
  playing: boolean;
  /** Index into SPEED_STEPS. */
  speedIndex: number;
  onYearChange: (year: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedIndexChange: (index: number) => void;
}

export default function TimeSlider({
  year,
  min,
  max,
  playing,
  speedIndex,
  onYearChange,
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
    intervalRef.current = setInterval(() => {
      onYearChange(year >= max ? min : year + 1);
    }, intervalMsForSpeed(speed));
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, year, min, max, speed, onYearChange]);

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
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="w-40 sm:w-64 md:w-96 accent-neutral-900"
          aria-label={t("year")}
        />
        <div className="flex justify-between text-[10px] text-neutral-400">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>

      <div className="text-2xl font-bold tabular-nums w-20 text-center shrink-0">
        {year}
      </div>

      {/* playback speed */}
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
