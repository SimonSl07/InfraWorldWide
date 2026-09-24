// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

/**
 * Covers the playback timer, which used to list `month` as an effect
 * dependency: every advance tore the interval down and built a new one,
 * degenerating into a drifting chain of timeouts and churning a timer several
 * times a second during playback.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

const { default: TimeSlider } = await import("./TimeSlider");

function setup(overrides: Partial<Parameters<typeof TimeSlider>[0]> = {}) {
  const onMonthChange = vi.fn();
  const props = {
    month: 24_000,
    min: 23_640,
    max: 24_360,
    playing: false,
    locale: "en",
    speedIndex: 1,
    onMonthChange,
    onPlayingChange: vi.fn(),
    onSpeedIndexChange: vi.fn(),
    ...overrides,
  };
  const view = render(<TimeSlider {...props} />);
  const rerender = (next: Partial<typeof props>) =>
    view.rerender(<TimeSlider {...props} {...next} />);
  return { onMonthChange, rerender, props };
}

afterEach(() => vi.useRealTimers());

describe("TimeSlider", () => {
  it("does not run a timer while paused", () => {
    vi.useFakeTimers();
    const { onMonthChange } = setup({ playing: false });
    act(() => void vi.advanceTimersByTime(10_000));
    expect(onMonthChange).not.toHaveBeenCalled();
  });

  it("advances while playing", () => {
    vi.useFakeTimers();
    const { onMonthChange } = setup({ playing: true });
    act(() => void vi.advanceTimersByTime(2_000));
    expect(onMonthChange).toHaveBeenCalled();
    expect(onMonthChange.mock.calls[0][0]).toBeGreaterThan(24_000);
  });

  it("keeps one interval across month changes", () => {
    // The regression: re-rendering with a new month must not recreate the
    // timer, so the tick cadence stays even instead of restarting each time.
    vi.useFakeTimers();
    const clearInterval = vi.spyOn(globalThis, "clearInterval");
    const setInterval = vi.spyOn(globalThis, "setInterval");

    const { rerender } = setup({ playing: true });
    const created = setInterval.mock.calls.length;

    act(() => void rerender({ month: 24_001 }));
    act(() => void rerender({ month: 24_002 }));
    act(() => void rerender({ month: 24_003 }));

    expect(setInterval.mock.calls.length).toBe(created);
    expect(clearInterval).not.toHaveBeenCalled();
  });

  it("reads the current month on each tick rather than a captured one", () => {
    vi.useFakeTimers();
    const { onMonthChange, rerender } = setup({ playing: true });

    act(() => void vi.advanceTimersByTime(2_000));
    onMonthChange.mockClear();

    act(() => void rerender({ month: 24_100 }));
    act(() => void vi.advanceTimersByTime(2_000));

    expect(onMonthChange).toHaveBeenCalled();
    expect(onMonthChange.mock.calls[0][0]).toBeGreaterThan(24_100);
  });

  it("wraps to the start after passing the last month", () => {
    vi.useFakeTimers();
    const { onMonthChange, props } = setup({ playing: true, month: 24_360 });
    act(() => void vi.advanceTimersByTime(2_000));
    expect(onMonthChange).toHaveBeenCalledWith(props.min);
  });

  it("never steps past the last month", () => {
    vi.useFakeTimers();
    const { onMonthChange, props } = setup({
      playing: true,
      month: 24_359,
      speedIndex: 3,
    });
    act(() => void vi.advanceTimersByTime(5_000));
    for (const [value] of onMonthChange.mock.calls) {
      expect(value).toBeLessThanOrEqual(props.max);
    }
  });

  it("labels the play control by what pressing it does", () => {
    setup({ playing: false });
    expect(screen.getByRole("button", { name: "play" })).toBeInTheDocument();
  });

  it("switches the label while playing", () => {
    setup({ playing: true });
    expect(screen.getByRole("button", { name: "pause" })).toBeInTheDocument();
  });
});

describe("TimeSlider comparing", () => {
  // Two dates, two timelines, one card. The second date used to be a pair
  // of steppers out on the map, away from the one control a reader looks
  // at to change a date.
  it("shows a track for each pane, both over the whole range", () => {
    setup({ compare: { beforeMonth: 23_800, onBeforeMonthChange: vi.fn() } });
    const tracks = screen.getAllByRole("slider");
    // Two months plus the playback speed.
    expect(tracks).toHaveLength(3);
    for (const track of tracks.slice(0, 2)) {
      expect(track).toHaveAttribute("min", "23640");
      expect(track).toHaveAttribute("max", "24360");
    }
  });

  it("drives the left pane from the left track alone", () => {
    const onBeforeMonthChange = vi.fn();
    const { onMonthChange } = setup({
      compare: { beforeMonth: 23_800, onBeforeMonthChange },
    });
    const before = screen.getByLabelText("compareBeforeMonth");
    fireEvent.change(before, { target: { value: "23700" } });
    expect(onBeforeMonthChange).toHaveBeenCalledWith(23_700);
    expect(onMonthChange).not.toHaveBeenCalled();
  });

  it("leaves playback on the right pane, which is the viewed month", () => {
    vi.useFakeTimers();
    const onBeforeMonthChange = vi.fn();
    const { onMonthChange } = setup({
      playing: true,
      compare: { beforeMonth: 23_800, onBeforeMonthChange },
    });
    act(() => void vi.advanceTimersByTime(2_000));
    expect(onMonthChange).toHaveBeenCalled();
    expect(onBeforeMonthChange).not.toHaveBeenCalled();
  });

  it("carries the summary of the two dates, which had nowhere else to go", () => {
    setup({
      note: "2,076 km opened between 2015 and 2028",
      compare: { beforeMonth: 23_800, onBeforeMonthChange: vi.fn() },
    });
    expect(
      screen.getByText("2,076 km opened between 2015 and 2028"),
    ).toBeInTheDocument();
  });
});
