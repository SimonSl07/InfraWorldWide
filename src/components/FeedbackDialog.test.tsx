// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HONEYPOT_FIELD } from "@/lib/feedback";

/**
 * The only form on the site, and the only thing that talks to a server.
 * It had no tests, including the part that decides whether a reporter is
 * told their message arrived.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => "ro",
}));

const { default: FeedbackDialog } = await import("./FeedbackDialog");

// jsdom implements <dialog> but not showModal/close.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
  // Patch the two methods rather than replacing the global: jsdom has no
  // object URLs, but everything else still needs the real URL constructor.
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => {};
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function open() {
  const user = userEvent.setup();
  render(<FeedbackDialog />);
  await user.click(screen.getByRole("button", { name: "nav" }));
  return user;
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/emailLabel/), "reporter@example.com");
  await user.type(
    screen.getByLabelText(/messageLabel/),
    "The A1 section near Sibiu is drawn twice on the map.",
  );
}

describe("FeedbackDialog", () => {
  it("stays closed until the trigger is pressed", () => {
    render(<FeedbackDialog />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("carries a honeypot field that a real user never sees", async () => {
    await open();
    const honeypot = document.querySelector(`[name="${HONEYPOT_FIELD}"]`);
    expect(honeypot).toBeInTheDocument();
    // Hidden from sight and from assistive tech, but still submitted.
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot?.closest("[aria-hidden='true']")).toBeTruthy();
  });

  it("posts the page URL and the locale alongside the typed fields", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const user = await open();
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = init.body as FormData;
    expect(body.get("locale")).toBe("ro");
    expect(body.get("pageUrl")).toBe(window.location.href);
    expect(body.get("email")).toBe("reporter@example.com");
  });

  it("reports failure rather than claiming the report was sent", async () => {
    // A 503 is what the route now returns in production when no delivery
    // target is configured. Telling the reporter "thanks" would lose it.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 })),
    );

    const user = await open();
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("errorGeneric"),
    );
  });

  it("reports failure when the request itself throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    const user = await open();
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("errorGeneric"),
    );
  });

  it("confirms success when the report is accepted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
    );

    const user = await open();
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() =>
      expect(screen.getByText(/successTitle/)).toBeInTheDocument(),
    );
  });

  it("rejects a photo of the wrong type without posting it", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const user = await open();
    await fillValid(user);
    // The `accept` attribute is the first line of defence and a browser
    // enforces it. Dropping it here is how a user who picks "all files"
    // reaches the second line, which is what this test is about.
    const input = screen.getByLabelText(/photoLabel/);
    expect(input).toHaveAttribute("accept", expect.stringContaining("image/"));
    input.removeAttribute("accept");

    await user.upload(
      input,
      new File(["#!/bin/sh"], "run.sh", { type: "text/x-sh" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent("errorPhotoType");

    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a photo of an allowed type", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const user = await open();
    await fillValid(user);
    await user.upload(
      screen.getByLabelText(/photoLabel/),
      new File(["x"], "site.png", { type: "image/png" }),
    );

    await user.click(screen.getByRole("button", { name: "submit" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.body as FormData).get("photo")).toBeInstanceOf(File);
  });
});
