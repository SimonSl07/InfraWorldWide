// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

/**
 * The first component test in the repo. It covers the mobile disclosure,
 * which exists because seven nav items in one non-wrapping row measured 671px
 * against a 375px viewport and made every page scroll sideways.
 */

const pathname = vi.hoisted(() => ({ current: "/map" }));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathname.current,
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: SiteNav } = await import("./SiteNav");

const items = [
  { href: "/map", label: "Map" },
  { href: "/projects", label: "Projects" },
  { href: "/countries", label: "Countries" },
];

function renderNav() {
  return render(
    <SiteNav items={items} menuLabel="Menu" closeMenuLabel="Close menu">
      <span>switcher</span>
    </SiteNav>,
  );
}

beforeEach(() => {
  pathname.current = "/map";
});

describe("SiteNav", () => {
  it("renders every item in the inline navigation", () => {
    renderNav();
    for (const item of items) {
      expect(screen.getAllByRole("link", { name: item.label })[0]).toHaveAttribute(
        "href",
        item.href,
      );
    }
  });

  it("marks the current page, and only that one", () => {
    pathname.current = "/projects";
    renderNav();
    const current = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Projects");
  });

  it("treats a detail page as being under its section", () => {
    // /projects/ro-a1 should still light up "Projects".
    pathname.current = "/projects/ro-a1";
    renderNav();
    const current = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Projects");
  });

  it("does not match a sibling route by prefix", () => {
    // "/countries" must not light up when the path is "/countries-foo".
    pathname.current = "/countries-foo";
    renderNav();
    expect(
      screen.queryAllByRole("link").filter(
        (el) => el.getAttribute("aria-current") === "page",
      ),
    ).toHaveLength(0);
  });

  it("keeps the mobile panel closed until the button is pressed", async () => {
    renderNav();
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(button);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("closes the panel on Escape and returns focus to the button", async () => {
    renderNav();
    const button = screen.getByRole("button", { name: "Menu" });
    await userEvent.click(button);

    await userEvent.keyboard("{Escape}");

    const reopened = screen.getByRole("button", { name: "Menu" });
    expect(reopened).toHaveAttribute("aria-expanded", "false");
    expect(reopened).toHaveFocus();
  });

  it("wires the button to the panel it controls", async () => {
    renderNav();
    const button = screen.getByRole("button", { name: "Menu" });
    await userEvent.click(button);

    const panelId = button.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId as string)).toBeInTheDocument();
  });
});
