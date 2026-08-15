/**
 * One checked JSON fetch for every client-side data load.
 *
 * The failure this exists for: a missing artifact under /data does not
 * return JSON, it returns the framework's HTML error page with a 404. An
 * unchecked `res.json()` then throws a SyntaxError that reads as a parse
 * bug rather than a missing file, and any `.catch(console.error)` swallows
 * it into a map that never draws. Checking `response.ok` first, and
 * carrying the url and status on the error, makes both cases reportable.
 */

/** How much of an unparseable body goes into the error message. */
const BODY_SNIPPET = 120;

export class FetchJsonError extends Error {
  /** The requested url. */
  readonly url: string;
  /** HTTP status, or null when the request never got a response. */
  readonly status: number | null;

  constructor(
    message: string,
    url: string,
    status: number | null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "FetchJsonError";
    this.url = url;
    this.status = status;
  }
}

/**
 * Fetches `url` and parses the body as JSON, throwing `FetchJsonError` on a
 * non-2xx status, a transport failure, or a body that is not JSON.
 *
 * `fetchImpl` is injectable so the behaviour can be tested without a server.
 */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (cause) {
    throw new FetchJsonError(`Request to ${url} failed`, url, null, { cause });
  }

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new FetchJsonError(
      `${url} returned ${response.status}${statusText}`,
      url,
      response.status,
    );
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    // Quoting the head of the body turns "Unexpected token <" into the
    // actual answer: which url served what instead of JSON.
    const snippet = text.slice(0, BODY_SNIPPET).replace(/\s+/g, " ").trim();
    throw new FetchJsonError(
      `${url} did not return JSON: ${snippet}`,
      url,
      response.status,
      { cause },
    );
  }
}
