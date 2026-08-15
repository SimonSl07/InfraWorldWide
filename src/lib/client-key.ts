/**
 * Who is calling, for rate-limiting purposes.
 *
 * The naive version of this reads `x-forwarded-for` and falls back to the
 * literal string "unknown". That fallback is the dangerous part: on a host
 * that sets no address header, every visitor shares one allowance, so five
 * submissions disable the form for everybody. Returning null instead lets the
 * caller bucket unidentifiable traffic separately.
 *
 * `trusted` distinguishes a header the platform sets from one the client can
 * forge. `x-forwarded-for` is attacker-controlled when a request reaches the
 * handler unproxied, so it identifies well-behaved callers but bounds nothing.
 */

export interface ClientIdentity {
  /** Null when no address header was present at all. */
  key: string | null;
  trusted: boolean;
}

/** Headers the platform sets itself, in order of preference. */
const TRUSTED_HEADERS = [
  "x-vercel-forwarded-for",
  "cf-connecting-ip",
  "x-real-ip",
] as const;

/** First non-empty entry of a comma-separated forwarding chain. */
function firstHop(value: string | null): string | null {
  if (!value) return null;
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function resolveClientKey(headers: Headers): ClientIdentity {
  for (const name of TRUSTED_HEADERS) {
    const key = firstHop(headers.get(name));
    if (key) return { key, trusted: true };
  }

  const forwarded = firstHop(headers.get("x-forwarded-for"));
  if (forwarded) return { key: forwarded, trusted: false };

  return { key: null, trusted: false };
}
