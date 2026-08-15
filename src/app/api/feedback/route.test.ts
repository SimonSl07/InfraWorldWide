import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The route handler had no tests at all: not the 429 path, not the honeypot's
 * deliberate fake success, not either delivery failure. The module-level rate
 * limiter keeps state, so every case re-imports the module to start clean.
 */

type Handler = (request: Request) => Promise<Response>;

async function loadRoute(): Promise<Handler> {
  vi.resetModules();
  const mod = await import("./route");
  return mod.POST as Handler;
}

function submission(fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("reason", "bug");
  form.set("email", "reporter@example.com");
  form.set("message", "The A1 section near Sibiu is drawn twice on the map.");
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

function post(form: FormData, headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/feedback", {
    method: "POST",
    body: form,
    headers,
  });
}

const IDENTIFIED = { "x-vercel-forwarded-for": "203.0.113.7" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/feedback", () => {
  it("rejects a malformed submission with 400 and the failing fields", async () => {
    const POST = await loadRoute();
    const res = await POST(post(submission({ email: "not-an-email" }), IDENTIFIED));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid");
    expect(body.issues.map((i: { path: string }) => i.path)).toContain("email");
  });

  it("answers a honeypot hit with success but never delivers it", async () => {
    const POST = await loadRoute();
    const res = await POST(post(submission({ website: "spam" }), IDENTIFIED));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, delivered: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rate-limits an identified client after 5 submissions", async () => {
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://hooks.example.com/abc");
    const POST = await loadRoute();

    for (let i = 0; i < 5; i++) {
      const ok = await POST(post(submission(), IDENTIFIED));
      expect(ok.status).toBe(200);
    }
    const blocked = await POST(post(submission(), IDENTIFIED));
    expect(blocked.status).toBe(429);
  });

  it("keeps separate allowances per client", async () => {
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://hooks.example.com/abc");
    const POST = await loadRoute();

    for (let i = 0; i < 5; i++) {
      await POST(post(submission(), { "x-vercel-forwarded-for": "203.0.113.7" }));
    }
    const other = await POST(
      post(submission(), { "x-vercel-forwarded-for": "203.0.113.8" }),
    );
    expect(other.status).toBe(200);
  });

  it("does not lock out the world when the host sets no address header", async () => {
    // The old code bucketed these under the literal string "unknown", so five
    // submissions disabled the form for every visitor.
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://hooks.example.com/abc");
    const POST = await loadRoute();

    for (let i = 0; i < 5; i++) {
      expect((await POST(post(submission()))).status).toBe(200);
    }
    expect((await POST(post(submission()))).status).toBe(200);
  });

  it("forwards a valid submission and reports it delivered", async () => {
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://hooks.example.com/abc");
    const POST = await loadRoute();
    const res = await POST(post(submission(), IDENTIFIED));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, delivered: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.example.com/abc");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns 502 when the webhook rejects the delivery", async () => {
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://hooks.example.com/abc");
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    const POST = await loadRoute();
    const res = await POST(post(submission(), IDENTIFIED));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: "delivery_failed" });
  });

  it("returns 502 when the webhook request throws", async () => {
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://hooks.example.com/abc");
    fetchMock.mockRejectedValue(new Error("connect ETIMEDOUT"));
    const POST = await loadRoute();

    expect((await POST(post(submission(), IDENTIFIED))).status).toBe(502);
  });

  it("logs instead of delivering when no webhook is configured outside production", async () => {
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "");
    const POST = await loadRoute();
    const res = await POST(post(submission(), IDENTIFIED));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, delivered: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to silently swallow feedback in production", async () => {
    // Accepting a report into a console log on a live deployment loses it, and
    // the reporter is told it was sent.
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    const POST = await loadRoute();
    const res = await POST(post(submission(), IDENTIFIED));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: "not_configured" });
  });

  it("rejects a photo of the wrong type", async () => {
    const POST = await loadRoute();
    const form = submission();
    form.set("photo", new File(["#!/bin/sh"], "run.sh", { type: "text/x-sh" }));

    const res = await POST(post(form, IDENTIFIED));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "photo_type" });
  });

  it("treats a zero-byte file as no photo at all", async () => {
    // An untouched file input still posts an entry.
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://hooks.example.com/abc");
    const POST = await loadRoute();
    const form = submission();
    form.set("photo", new File([], "", { type: "application/octet-stream" }));

    expect((await POST(post(form, IDENTIFIED))).status).toBe(200);
  });

  it("does not hand a rotating x-forwarded-for a fresh allowance each time", async () => {
    // That header is attacker-controlled when a request reaches the handler
    // unproxied. Per-value buckets would mean no limit at all, so untrusted
    // callers share the anonymous allowance instead.
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://hooks.example.com/abc");
    const POST = await loadRoute();

    let blocked = 0;
    for (let i = 0; i < 70; i++) {
      const res = await POST(
        post(submission(), { "x-forwarded-for": `203.0.113.${i}` }),
      );
      if (res.status === 429) blocked++;
    }
    expect(blocked).toBeGreaterThan(0);
  });

  it("still gives a platform-set address its own allowance", async () => {
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "https://hooks.example.com/abc");
    const POST = await loadRoute();

    for (let i = 0; i < 5; i++) {
      await POST(post(submission(), { "x-vercel-forwarded-for": "203.0.113.7" }));
    }
    expect(
      (await POST(post(submission(), { "x-vercel-forwarded-for": "203.0.113.7" })))
        .status,
    ).toBe(429);
    expect(
      (await POST(post(submission(), { "x-vercel-forwarded-for": "203.0.113.8" })))
        .status,
    ).toBe(200);
  });
});
