// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LotEntry } from "@/lib/lot-list";

/**
 * The panel is a disclosure, and that is the part worth pinning: opened by
 * default it covered a phone screen from the filters down to the slider. The
 * figure has to survive on the button, or closing it hides the one number
 * that would make a reader open it.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join("/")}` : key,
}));

const { default: ChangePanel } = await import("./ChangePanel");

/** Opened in the month the tests treat as "now". */
const NOW = 2025 * 12 + 5;

function lot(props: Partial<LotEntry>): LotEntry {
  return {
    lotId: "lot",
    projectId: "ro-a7",
    projectName: "A7 motorway",
    lotName: "Adjud – Bacău",
    country: "ro",
    category: "highway",
    status: "opened",
    lengthKm: 30,
    openedMonth: NOW - 12,
    constructionStartMonth: null,
    expectedOpeningMonth: null,
    opened: 2024,
    expectedOpening: null,
    expectedOpeningDerived: false,
    ...props,
  };
}

function panel(lots: LotEntry[] = [lot({})]) {
  return (
    <ChangePanel
      lots={lots}
      month={NOW}
      nowMonth={NOW}
      baselineYears={5}
      onBaselineYearsChange={() => {}}
      highlight={false}
      onHighlightChange={() => {}}
      onSelect={() => {}}
      locale="en"
    />
  );
}

describe("ChangePanel", () => {
  it("starts closed, with the figure on the button", () => {
    render(panel());
    const toggle = screen.getByRole("button", { name: /map\.changeTitle/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("+30 km");
    expect(screen.queryByText("map.highlightNew")).not.toBeInTheDocument();
  });

  it("opens on click and closes again", async () => {
    const user = userEvent.setup();
    render(panel());
    const toggle = screen.getByRole("button", { name: /map\.changeTitle/ });

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("map.highlightNew")).toBeInTheDocument();
    expect(screen.getByText("Adjud – Bacău")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("shows nothing gained as a plain zero rather than a plus", () => {
    render(panel([lot({ openedMonth: NOW - 12 * 40, opened: 1985 })]));
    const toggle = screen.getByRole("button", { name: /map\.changeTitle/ });
    expect(toggle).toHaveTextContent("0 km");
    expect(toggle).not.toHaveTextContent("+0 km");
  });
});
