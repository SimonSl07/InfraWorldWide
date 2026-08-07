import { describe, it, expect } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit inside one window", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("a", 100)).toBe(true);
    expect(limiter.check("a", 200)).toBe(true);
    expect(limiter.check("a", 300)).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("b", 0)).toBe(true);
    expect(limiter.check("a", 0)).toBe(false);
  });

  it("lets hits expire once the window passes", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.check("a", 0)).toBe(true);
    // A hit counts while it is strictly inside the window, so the one at t=0
    // still blocks at t=999 and has aged out at exactly t=1000.
    expect(limiter.check("a", 999)).toBe(false);
    expect(limiter.check("a", 1000)).toBe(true);
  });

  it("does not extend the block while a caller keeps retrying", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.check("a", 0)).toBe(true);
    // Rejected attempts must not count as hits, or the window never drains.
    expect(limiter.check("a", 500)).toBe(false);
    expect(limiter.check("a", 900)).toBe(false);
    expect(limiter.check("a", 1001)).toBe(true);
  });
});
