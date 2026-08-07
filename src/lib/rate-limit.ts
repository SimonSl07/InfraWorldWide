/**
 * Fixed-window rate limiter over an in-memory map.
 *
 * Best-effort by design: on serverless hosts each instance keeps its own
 * counters, so a flood spread across cold starts gets through. It exists to
 * blunt naive repeat-submit loops cheaply, not as a security boundary — put a
 * real limiter at the edge if abuse becomes a genuine problem.
 *
 * The clock is injected rather than read from Date.now() so the behaviour at
 * window boundaries is testable.
 */

export interface RateLimiter {
  /**
   * Records a hit for `key`. Returns true when the request is allowed.
   *
   * A hit counts while it is strictly inside the window — one at `t` has aged
   * out by `t + windowMs`. Rejected calls are not recorded, so a caller that
   * keeps retrying cannot hold its own window open.
   */
  check(key: string, now: number): boolean;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const { limit, windowMs } = options;
  const hits = new Map<string, number[]>();

  return {
    check(key, now) {
      const cutoff = now - windowMs;

      // Drop keys that went quiet, otherwise the map grows without bound for
      // the lifetime of the process.
      for (const [k, times] of hits) {
        if (times[times.length - 1] <= cutoff) hits.delete(k);
      }

      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }

      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}
