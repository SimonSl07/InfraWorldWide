// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { Project } from "@/lib/schema";

/**
 * The browser's filters live in the URL, so a filtered list can be shared.
 * Two things are easy to break and are pinned here: the state is read from
 * the query string on load, and every change is written back to it.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

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

const { default: ProjectsBrowser } = await import("./ProjectsBrowser");

function project(
  id: string,
  name: string,
  country: string,
  category: Project["category"],
  lengthKm: number,
): Project {
  return {
    id,
    country,
    category,
    name: { en: name },
    description: { en: name },
    sources: [{ title: "s", url: "https://example.org" }],
    lots: [
      {
        id: `${id}-1`,
        name: { en: `${name} lot` },
        status: "opened",
        lengthKm,
        geometryRef: `${id}-1`,
      },
    ],
  } as Project;
}

const projects = [
  project("ro-a1", "A1 motorway", "ro", "highway", 400),
  project("ro-rail", "Cluj railway", "ro", "railway", 100),
  project("bg-a2", "Hemus motorway", "bg", "highway", 200),
];

const cardNames = () =>
  screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

beforeEach(() => {
  window.history.replaceState(null, "", "/en/projects");
});

describe("ProjectsBrowser", () => {
  it("applies the filters the URL arrives with", () => {
    window.history.replaceState(null, "", "/en/projects?cat=railway");
    render(<ProjectsBrowser projects={projects} />);
    expect(cardNames()).toEqual(["Cluj railway"]);
  });

  it("writes a filter change back to the URL", async () => {
    const user = userEvent.setup();
    render(<ProjectsBrowser projects={projects} />);

    await user.selectOptions(
      screen.getByLabelText("projects.categoryLabel"),
      "railway",
    );

    expect(window.location.search).toBe("?cat=railway");
    expect(cardNames()).toEqual(["Cluj railway"]);
  });

  it("sorts by length when asked, and says so in the URL", async () => {
    const user = userEvent.setup();
    render(<ProjectsBrowser projects={projects} />);

    await user.selectOptions(
      screen.getByLabelText("projects.sortLabel"),
      "length",
    );

    expect(cardNames()).toEqual([
      "A1 motorway",
      "Hemus motorway",
      "Cluj railway",
    ]);
    expect(window.location.search).toBe("?sort=length");
  });

  it("keeps the locked country out of the query string", async () => {
    const user = userEvent.setup();
    render(<ProjectsBrowser projects={projects} lockedCountry="ro" />);

    // No country picker to change, so the only param a change can add is the
    // one that was actually changed.
    expect(screen.queryByLabelText("projects.countryLabel")).toBeNull();
    await user.selectOptions(
      screen.getByLabelText("projects.categoryLabel"),
      "highway",
    );

    expect(window.location.search).toBe("?cat=highway");
    expect(cardNames()).toEqual(["A1 motorway"]);
  });
});
