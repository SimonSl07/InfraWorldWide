// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MoneyLine } from "./MoneyLine";

/**
 * A figure's qualifiers are what stop it being misread, and the year is the
 * one that used to go wrong: the map panel printed "(undefined)" whenever a
 * source gave no price year.
 */

const t = (key: string) => key;

describe("MoneyLine", () => {
  it("prints the price year in brackets when the source gave one", () => {
    const { container } = render(
      <MoneyLine money={{ amount: 500, currency: "EUR", year: 2019 }} locale="en" t={t} />,
    );
    expect(container).toHaveTextContent("€500M");
    expect(container).toHaveTextContent("(2019)");
  });

  it("prints nothing at all in place of a missing year", () => {
    const { container } = render(
      <MoneyLine money={{ amount: 500, currency: "EUR" }} locale="en" t={t} />,
    );
    expect(container.textContent).toBe("€500M");
    expect(container.textContent).not.toContain("undefined");
    expect(container.textContent).not.toMatch(/\(\s*\)/);
  });

  it("tags a figure whose scope is narrower than a total", () => {
    render(
      <MoneyLine
        money={{ amount: 500, currency: "EUR", year: 2019, scope: "works" }}
        locale="en"
        t={t}
      />,
    );
    expect(screen.getByText("project.moneyScope.works")).toBeInTheDocument();
  });

  it("leaves the plain case untagged", () => {
    const { container } = render(
      <MoneyLine
        money={{
          amount: 500,
          currency: "EUR",
          year: 2019,
          scope: "total",
          confidence: "reported",
        }}
        locale="en"
        t={t}
      />,
    );
    expect(container.textContent).toBe("€500M(2019)");
  });

  it("writes the amount in the reader's locale", () => {
    const { container } = render(
      <MoneyLine money={{ amount: 1800, currency: "EUR" }} locale="ro" t={t} />,
    );
    expect(container.textContent).toBe("€1,8 mld.");
  });
});
