import { describe, it, expect } from "vitest";
import { fetchJson, FetchJsonError } from "./fetch-json";

/** A fetch stub that answers every call with one canned response. */
function stub(body: string, init: ResponseInit = {}): typeof fetch {
  return (async () => new Response(body, init)) as unknown as typeof fetch;
}

/** The error a promise rejects with, typed. Fails if it resolves. */
async function rejection(promise: Promise<unknown>): Promise<FetchJsonError> {
  try {
    await promise;
  } catch (error) {
    return error as FetchJsonError;
  }
  throw new Error("expected the promise to reject");
}

describe("fetchJson", () => {
  it("resolves the parsed body on 200", async () => {
    const data = await fetchJson<{ countries: string[] }>(
      "/data/geo/manifest.json",
      undefined,
      stub('{"countries":["ro","bg"]}'),
    );
    expect(data).toEqual({ countries: ["ro", "bg"] });
  });

  it("passes the url and init through to fetch", async () => {
    const seen: Array<[string, RequestInit | undefined]> = [];
    const spy = (async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      return new Response("[]");
    }) as unknown as typeof fetch;
    await fetchJson("/data/x.json", { cache: "no-store" }, spy);
    expect(seen).toEqual([["/data/x.json", { cache: "no-store" }]]);
  });

  it("rejects with the status and url on 404", async () => {
    // What a missing artifact actually returns: Next's HTML error page.
    const error = await rejection(
      fetchJson(
        "/data/geo/projects/nope.geojson",
        undefined,
        stub("<!DOCTYPE html><html>404</html>", {
          status: 404,
          statusText: "Not Found",
        }),
      ),
    );
    expect(error).toBeInstanceOf(FetchJsonError);
    expect(error.status).toBe(404);
    expect(error.url).toBe("/data/geo/projects/nope.geojson");
    expect(error.message).toContain("404");
    expect(error.message).toContain("/data/geo/projects/nope.geojson");
  });

  it("rejects on a 200 whose body is not JSON, quoting the body", async () => {
    const error = await rejection(
      fetchJson(
        "/data/projects.json",
        undefined,
        stub("<!DOCTYPE html><html>not json</html>"),
      ),
    );
    expect(error).toBeInstanceOf(FetchJsonError);
    expect(error.url).toBe("/data/projects.json");
    expect(error.status).toBe(200);
    expect(error.message).toContain("<!DOCTYPE html>");
    expect(error.cause).toBeInstanceOf(SyntaxError);
  });

  it("wraps a transport failure, keeping the url and the cause", async () => {
    const offline = new TypeError("Failed to fetch");
    const error = await rejection(
      fetchJson("/data/countries.json", undefined, (async () => {
        throw offline;
      }) as unknown as typeof fetch),
    );
    expect(error).toBeInstanceOf(FetchJsonError);
    expect(error.url).toBe("/data/countries.json");
    expect(error.status).toBeNull();
    expect(error.cause).toBe(offline);
  });

  it("uses the global fetch when none is injected", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = stub('{"ok":true}');
    try {
      await expect(fetchJson("/data/x.json")).resolves.toEqual({ ok: true });
    } finally {
      globalThis.fetch = original;
    }
  });
});
