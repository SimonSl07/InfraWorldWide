import { describe, it, expect } from "vitest";
import { resolveClientKey } from "./client-key";

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("resolveClientKey", () => {
  it("prefers the platform header over the client-settable one", () => {
    const id = resolveClientKey(
      headers({
        "x-vercel-forwarded-for": "203.0.113.7",
        "x-forwarded-for": "198.51.100.1",
      }),
    );
    expect(id).toEqual({ key: "203.0.113.7", trusted: true });
  });

  it("falls back through the header order", () => {
    expect(
      resolveClientKey(headers({ "cf-connecting-ip": "203.0.113.8" })).key,
    ).toBe("203.0.113.8");
    expect(resolveClientKey(headers({ "x-real-ip": "203.0.113.9" })).key).toBe(
      "203.0.113.9",
    );
  });

  it("takes the first hop of a forwarded chain", () => {
    const id = resolveClientKey(
      headers({
        "x-forwarded-for": "203.0.113.10, 70.41.3.18, 150.172.238.178",
      }),
    );
    expect(id).toEqual({ key: "203.0.113.10", trusted: false });
  });

  it("marks x-forwarded-for untrusted, since a client can set it", () => {
    expect(
      resolveClientKey(headers({ "x-forwarded-for": "203.0.113.11" })).trusted,
    ).toBe(false);
  });

  it("reports no identity rather than collapsing everyone into one bucket", () => {
    // A host that sets no address header must not put every visitor on earth
    // into a single shared allowance. The caller buckets these separately.
    expect(resolveClientKey(headers({}))).toEqual({
      key: null,
      trusted: false,
    });
  });

  it("ignores blank and whitespace-only header values", () => {
    expect(
      resolveClientKey(headers({ "x-forwarded-for": "   " })).key,
    ).toBeNull();
    expect(
      resolveClientKey(headers({ "x-forwarded-for": " , 203.0.113.12" })).key,
    ).toBe("203.0.113.12");
  });
});
