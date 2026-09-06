// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LotEntry } from "@/lib/lot-list";

/**
 * The list is the only route to a road without a mouse, so the keyboard
 * contract is the thing worth pinning: arrows walk the rows, Home/End jump,
 * and arrowing off the top lands back in the search box rather than
 * stranding focus inside a scroll container.
 */

vi.mock("next-intl", () => ({
  // Echo the key, except the two messages the panel formats with values.
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join("/")}` : key,
}));

const { default: LotSearchPanel } = await import("./LotSearchPanel");

function lot(props: Partial<LotEntry>): LotEntry {
  return {
    lotId: "lot",
    projectId: "ro-a1",
    projectName: "A1 motorway",
    lotName: "Section",
    country: "ro",
    category: "highway",
    status: "opened",
    lengthKm: 10,
    openedMonth: null,
    constructionStartMonth: null,
    expectedOpeningMonth: null,
    opened: null,
    expectedOpening: null,
    expectedOpeningDerived: false,
    ...props,
  };
}

const lots = [
  lot({ lotId: "a", lotName: "Sebeș–Turda", projectName: "A10 motorway" }),
  lot({ lotId: "b", lotName: "Aiud – Decea", projectName: "A10 motorway" }),
  lot({
    lotId: "c",
    lotName: "Pipera",
    projectName: "Bucharest Metro M2",
    projectId: "ro-metro-m2",
    category: "railway",
  }),
];

function renderPanel(onSelect = vi.fn()) {
  render(
    <LotSearchPanel
      lots={lots}
      selectedLotId={null}
      onSelect={onSelect}
      locale="en"
    />,
  );
  return onSelect;
}

const rows = () =>
  screen.queryAllByRole("button").filter((b) => b.hasAttribute("data-lot-row"));

describe("LotSearchPanel", () => {
  it("keeps the list closed until asked, and reports the count", () => {
    renderPanel();
    expect(rows()).toHaveLength(0);
    // country.lots is an ICU plural over the number of visible lots.
    expect(screen.getByRole("button", { name: /country\.lots/ })).toBeTruthy();
  });

  it("lists every visible lot once opened", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: /country\.lots/ }));
    expect(rows()).toHaveLength(3);
  });

  it("filters as you type, ignoring diacritics", async () => {
    renderPanel();
    // Typing alone opens the list: no second gesture needed.
    await userEvent.type(screen.getByRole("searchbox"), "sebes");
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText("Sebeș–Turda")).toBeTruthy();
  });

  it("says so when nothing matches", async () => {
    renderPanel();
    await userEvent.type(screen.getByRole("searchbox"), "zzzz");
    expect(rows()).toHaveLength(0);
    expect(screen.getByText("map.searchEmpty")).toBeTruthy();
  });

  it("walks the rows with the arrow keys and comes back to the input", async () => {
    renderPanel();
    const input = screen.getByRole("searchbox");
    input.focus();

    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(rows()[0]);

    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(rows()[1]);

    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(rows()[2]);

    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(rows()[0]);

    // Off the top is back where a keyboard user came from.
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(input);
  });

  it("returns focus to the search box on Escape", async () => {
    renderPanel();
    const input = screen.getByRole("searchbox");
    input.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(rows()[0]);

    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(input);
  });

  it("hands the whole lot back on activation, not just its id", async () => {
    // The caller needs projectId too: lot ids repeat across projects, and
    // the camera has to fly to this lot's geometry.
    const onSelect = renderPanel();
    await userEvent.type(screen.getByRole("searchbox"), "pipera");
    await userEvent.click(rows()[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({
      lotId: "c",
      projectId: "ro-metro-m2",
    });
  });

  it("can be activated from the keyboard alone", async () => {
    const onSelect = renderPanel();
    screen.getByRole("searchbox").focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].lotId).toBe("a");
  });

  it("shows keyboard focus on a row with an outline, not only a tint", async () => {
    // A background change alone is not a focus indicator: the ring has to be
    // visible in both themes, so the rows carry the same outline as DataTable.
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: /country\.lots/ }));
    expect(rows()[0].className).toContain("focus-visible:outline");
  });

  it("marks the selected row for assistive technology", async () => {
    render(
      <LotSearchPanel
        lots={lots}
        selectedLotId="b"
        onSelect={vi.fn()}
        locale="en"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /country\.lots/ }));
    const current = rows().filter(
      (r) => r.getAttribute("aria-current") === "true",
    );
    expect(current).toHaveLength(1);
    expect(within(current[0]).getByText("Aiud – Decea")).toBeTruthy();
  });
});
