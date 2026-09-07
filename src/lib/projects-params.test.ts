import { describe, it, expect } from "vitest";
import {
  parseProjectsParams,
  serializeProjectsParams,
  type ProjectsParams,
} from "./projects-params";

const COUNTRIES = ["ro", "bg", "rs"];
/** What a bare URL parses to: nothing filtered, the default sort. */
const EMPTY: ProjectsParams = {
  query: "",
  country: null,
  category: null,
  status: null,
  sort: "name",
};
const parse = (search: string, lockedCountry?: string) =>
  parseProjectsParams(search, { countries: COUNTRIES, lockedCountry });

describe("parseProjectsParams", () => {
  it("reads every filter the browser offers", () => {
    expect(parse("?q=a1&c=ro&cat=highway&st=opened&sort=length")).toEqual({
      query: "a1",
      country: "ro",
      category: "highway",
      status: "opened",
      sort: "length",
    });
  });

  it("returns the empty state for a bare URL", () => {
    expect(parse("")).toEqual(EMPTY);
  });

  it("drops a country that is not in the data", () => {
    // A shared link is untrusted input, and an unknown code would filter the
    // list down to nothing with no way to see why.
    expect(parse("?c=zz").country).toBeNull();
  });

  it("drops an unknown category, status and sort", () => {
    const state = parse("?cat=canal&st=demolished&sort=cost");
    expect(state.category).toBeNull();
    expect(state.status).toBeNull();
    expect(state.sort).toBe("name");
  });

  it("ignores the country param when the page fixes one", () => {
    // The country page has no picker, so ?c= there could only contradict it.
    expect(parse("?c=bg", "ro").country).toBe("ro");
  });

  it("trims the query", () => {
    expect(parse("?q=%20%20a1%20").query).toBe("a1");
  });
});

describe("serializeProjectsParams", () => {
  it("writes only what differs from the empty state", () => {
    expect(
      serializeProjectsParams({
        ...EMPTY,
        category: "railway",
      }),
    ).toBe("cat=railway");
  });

  it("writes nothing when no filter is set", () => {
    expect(serializeProjectsParams(EMPTY)).toBe("");
  });

  it("leaves the default sort out of the URL", () => {
    const state = { ...EMPTY, sort: "name" as const };
    expect(serializeProjectsParams(state)).toBe("");
  });

  it("omits the country the page already fixes", () => {
    const state = { ...EMPTY, country: "ro" };
    expect(serializeProjectsParams(state, { lockedCountry: "ro" })).toBe("");
  });

  it("round-trips a full state", () => {
    const state = {
      query: "sebeș",
      country: "ro",
      category: "highway" as const,
      status: "under_construction" as const,
      sort: "length" as const,
    };
    expect(
      parseProjectsParams(`?${serializeProjectsParams(state)}`, {
        countries: COUNTRIES,
      }),
    ).toEqual(state);
  });
});
