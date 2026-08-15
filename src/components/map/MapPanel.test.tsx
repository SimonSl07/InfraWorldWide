// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The three map panels used to mount as a bare `<aside>`: no role, no focus
 * move, no focus return and no Escape handler, so opening one from the
 * keyboard stranded focus on the map with no way to dismiss without a mouse.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key.split(".").pop() ?? key,
}));

const { default: MapPanel } = await import("./MapPanel");

function renderPanel(onClose = vi.fn()) {
  const view = render(
    <>
      <button type="button">opener</button>
      <MapPanel onClose={onClose} labelledBy="heading">
        <h3 id="heading">A1 motorway</h3>
        <a href="https://example.org/a1">view project</a>
      </MapPanel>
    </>,
  );
  return { onClose, view };
}

describe("MapPanel", () => {
  it("is a region named by its own heading", () => {
    renderPanel();
    const region = screen.getByRole("region", { name: "A1 motorway" });
    expect(region).toBeInTheDocument();
  });

  it("takes focus when it opens", () => {
    renderPanel();
    expect(screen.getByRole("region", { name: "A1 motorway" })).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const { onClose } = renderPanel();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("returns focus to whatever had it when the panel unmounts", async () => {
    const onClose = vi.fn();
    const view = render(
      <>
        <button type="button">opener</button>
        <MapPanel onClose={onClose} labelledBy="heading">
          <h3 id="heading">A1 motorway</h3>
        </MapPanel>
      </>,
    );
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();

    view.rerender(
      <>
        <button type="button">opener</button>
      </>,
    );
    expect(screen.getByRole("button", { name: "opener" })).toHaveFocus();
  });

  it("has a labelled close button", async () => {
    const { onClose } = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not trap focus, because the map stays usable behind it", async () => {
    // Deliberately not a modal: tabbing must be able to leave.
    renderPanel();
    await userEvent.tab();
    expect(document.activeElement).not.toBe(
      screen.getByRole("region", { name: "A1 motorway" }),
    );
  });

  it("keeps the content ahead of the close button in reading order", () => {
    renderPanel();
    const region = screen.getByRole("region", { name: "A1 motorway" });
    const link = screen.getByRole("link", { name: "view project" });
    const close = screen.getByRole("button", { name: "close" });
    const order = [...region.querySelectorAll("a, button")];
    expect(order.indexOf(link)).toBeLessThan(order.indexOf(close));
  });
});
