// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

/**
 * The presentational primitives. Each replaced two or three hand-written
 * copies, so what is pinned here is the detail those copies agreed on and a
 * refactor could quietly lose: the status colours, the field size on a rank,
 * the hidden country name, the rel on an outbound link.
 */

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { StatusBadge, statusBadgeClass } = await import("./StatusBadge");
const { RankBadge } = await import("./RankBadge");
const { Figure } = await import("./Figure");
const { SectionLink } = await import("./SectionLink");
const { CountryLabel } = await import("./CountryLabel");
const { ExternalLink } = await import("./ExternalLink");

describe("StatusBadge", () => {
  it("colours the pill by status", () => {
    render(<StatusBadge status="under_construction" label="Building" />);
    const pill = screen.getByText("Building");
    expect(pill).toHaveClass("bg-warn-soft", "text-warn", "text-xs");
    expect(statusBadgeClass("opened")).toBe("bg-good-soft text-good");
  });

  it("lets the call site set the type size instead of stacking two", () => {
    render(<StatusBadge status="opened" label="Open" className="text-[11px]" />);
    const pill = screen.getByText("Open");
    expect(pill).toHaveClass("text-[11px]");
    expect(pill).not.toHaveClass("text-xs");
  });
});

describe("RankBadge", () => {
  it("shows the field size, so a first of two cannot pass for a first of thirty", () => {
    const { container } = render(<RankBadge rank={{ position: 2, of: 5 }} />);
    expect(container).toHaveTextContent("#2 / 5");
  });

  it("drops the field size when compact", () => {
    const { container } = render(
      <RankBadge rank={{ position: 2, of: 5 }} compact />,
    );
    expect(container.textContent).toBe("#2");
  });

  it("renders nothing for an unranked figure", () => {
    const { container } = render(<RankBadge rank={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Figure", () => {
  it("puts the note on its own line in a card", () => {
    render(<Figure label="Population" value="1,800,000" note="2021" />);
    expect(screen.getByText("2021").tagName).toBe("DIV");
  });

  it("keeps the note inline when compact", () => {
    render(
      <Figure label="Population" value="1,800,000" note="(2021)" variant="compact" />,
    );
    expect(screen.getByText("(2021)").tagName).toBe("SPAN");
  });
});

describe("SectionLink", () => {
  it("links project and section to the project page", () => {
    render(
      <SectionLink
        projectId="ro-a1"
        projectName="A1"
        lotName="Sebeș–Turda"
        category="highway"
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/projects/ro-a1");
    expect(link).toHaveTextContent("A1 / Sebeș–Turda");
  });

  it("omits the separator for a whole-project row", () => {
    render(<SectionLink projectId="ro-a1" projectName="A1" category="highway" />);
    expect(screen.getByRole("link").textContent).toBe("A1");
  });
});

describe("CountryLabel", () => {
  it("hides the flag from assistive tech and shows the name", () => {
    const { container } = render(<CountryLabel code="ro" name="Romania" />);
    expect(container.querySelector("[aria-hidden]")).not.toBeNull();
    expect(container).toHaveTextContent("Romania");
  });

  it("keeps the name for screen readers and as a tooltip in a row of flags", () => {
    const { container } = render(
      <CountryLabel code="ro" name="Romania" srOnlyName />,
    );
    expect(screen.getByText("Romania")).toHaveClass("sr-only");
    expect(container.firstElementChild).toHaveAttribute("title", "Romania");
  });
});

describe("ExternalLink", () => {
  it("opens in a new tab without leaking the opener", () => {
    render(<ExternalLink href="https://example.org">Source</ExternalLink>);
    const link = screen.getByRole("link", { name: "Source" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
