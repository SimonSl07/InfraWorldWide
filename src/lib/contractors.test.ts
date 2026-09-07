import { describe, it, expect } from "vitest";
import {
  attributeLotContractors,
  contractorSlug,
  createContractorResolver,
  splitJointVenture,
  stripParenthetical,
  stripScopeNote,
} from "./contractors";
import type { ContractorRegistry } from "./schema";

const registry: ContractorRegistry = {
  note: "test",
  contractors: [
    {
      id: "astaldi",
      name: "Astaldi",
      aliases: ["Astaldi SpA", "Webuild (Astaldi)"],
    },
    { id: "webuild", name: "Webuild", aliases: ["Salini Impregilo"] },
    {
      id: "fcc-construccion",
      name: "FCC Construcción",
      aliases: ["FCC Construction", "FCC"],
    },
    { id: "alpine-bau", name: "Alpine Bau", aliases: ["Alpine"] },
    { id: "alstom", name: "Alstom", aliases: ["Alstom Transport"] },
    { id: "arcada-company", name: "Arcada Company", aliases: ["Arcada"] },
    { id: "sa-pe-construct", name: "SA&PE Construct", aliases: ["SA&PE"] },
    {
      id: "railworks",
      name: "RailWorks",
      members: ["alstom", "aktor", "arcada-company"],
      aliases: ["RailWorks (Alstom – Aktor – Arcada)"],
    },
  ],
};

const resolve = createContractorResolver(registry);
const ids = (raw: string) => resolve(raw).map((r) => r.id);

describe("contractorSlug", () => {
  it("folds case, diacritics and punctuation", () => {
    expect(contractorSlug("Max Bögl")).toBe("max-bogl");
    expect(contractorSlug("CCCF București")).toBe("cccf-bucuresti");
    expect(contractorSlug("Erbașu")).toBe("erbasu");
    expect(contractorSlug("SA&PE Construct")).toBe("sa-pe-construct");
    expect(contractorSlug("Euro Construct Trading '98")).toBe(
      "euro-construct-trading-98",
    );
  });

  it("folds letters that NFD alone leaves alone", () => {
    expect(contractorSlug("Skanska Øst")).toBe("skanska-ost");
    expect(contractorSlug("Budimex Łódź")).toBe("budimex-lodz");
  });

  it("collapses Romanian comma-below and cedilla spellings together", () => {
    expect(contractorSlug("Bucureşti")).toBe(contractorSlug("București"));
  });
});

describe("stripScopeNote", () => {
  it("cuts a colon scope note but keeps en-dash members", () => {
    expect(
      stripScopeNote("Alstom: Ilteu – Gurasada signalling and electrification"),
    ).toBe("Alstom");
    expect(stripScopeNote("Astaldi – Max Bögl (JV)")).toBe(
      "Astaldi – Max Bögl (JV)",
    );
  });

  /** The scope note's own text may contain en dashes; only the first colon
   *  separates, so a section name survives being cut off wholesale. */
  it("cuts at the first colon only", () => {
    expect(stripScopeNote("Webuild (Astaldi): subsections 2A and 2B")).toBe(
      "Webuild (Astaldi)",
    );
  });
});

describe("stripParenthetical", () => {
  it("drops trailing notes", () => {
    expect(
      stripParenthetical("Spedition UMB (north lot 4, Pantelimon–Manolache)"),
    ).toBe("Spedition UMB");
    expect(stripParenthetical("Alpine (contract terminated 2013)")).toBe(
      "Alpine",
    );
    expect(
      stripParenthetical(
        "Tirrena Scavi (contract cancelled at 58.26% progress)",
      ),
    ).toBe("Tirrena Scavi");
  });

  it("keeps a name that is only a parenthetical from vanishing", () => {
    expect(stripParenthetical("Impresa Pizzarotti & C.")).toBe(
      "Impresa Pizzarotti & C.",
    );
  });
});

describe("splitJointVenture", () => {
  it("splits on spaced en dashes and slashes", () => {
    expect(splitJointVenture("Geiger – Max Bögl – Comtram")).toEqual([
      "Geiger",
      "Max Bögl",
      "Comtram",
    ]);
    expect(splitJointVenture("Yuksel / Makimsar / Ener")).toEqual([
      "Yuksel",
      "Makimsar",
      "Ener",
    ]);
  });

  it("never splits on an ampersand inside a firm name", () => {
    expect(splitJointVenture("SA&PE Construct")).toEqual(["SA&PE Construct"]);
    expect(splitJointVenture("Impresa Pizzarotti & C.")).toEqual([
      "Impresa Pizzarotti & C.",
    ]);
  });
});

describe("createContractorResolver", () => {
  it("collapses spelling and suffix variants onto one firm", () => {
    expect(ids("FCC Construcción")).toEqual(["fcc-construccion"]);
    expect(ids("FCC Construction")).toEqual(["fcc-construccion"]);
    expect(ids("Astaldi SpA")).toEqual(["astaldi"]);
    expect(ids("Astaldi")).toEqual(["astaldi"]);
  });

  it("collapses scope-noted variants onto the bare firm", () => {
    expect(ids("Spedition UMB (north lot 4, Pantelimon–Manolache)")).toEqual([
      "spedition-umb",
    ]);
    expect(ids("Spedition UMB")).toEqual(["spedition-umb"]);
    expect(ids("Alpine (contract terminated 2013)")).toEqual(["alpine-bau"]);
  });

  it("matches a curated alias before stripping its parenthetical", () => {
    // Would otherwise resolve to "webuild".
    expect(ids("Webuild (Astaldi)")).toEqual(["astaldi"]);
    expect(ids("Webuild (Astaldi): subsections 2A and 2B")).toEqual([
      "astaldi",
    ]);
    // A bare Webuild lot still belongs to Webuild.
    expect(ids("Webuild (lot 3)")).toEqual(["webuild"]);
  });

  it("applies a corporate rename", () => {
    expect(ids("Salini Impregilo (lot 3)")).toEqual(["webuild"]);
  });

  it("credits a joint venture and each of its members", () => {
    expect(ids("Astaldi – Max Bögl (JV)")).toEqual([
      "jv:astaldi+max-bogl",
      "astaldi",
      "max-bogl",
    ]);
  });

  it("resolves member names through the registry", () => {
    expect(ids("FCC – Astaldi – Convensa")).toEqual([
      "jv:astaldi+convensa+fcc-construccion",
      "fcc-construccion",
      "astaldi",
      "convensa",
    ]);
  });

  it("gives the same joint-venture id whatever order members are listed in", () => {
    const a = resolve("Astaldi – Max Bögl (JV)").find((r) => r.kind === "jv");
    const b = resolve("Max Bögl – Astaldi").find((r) => r.kind === "jv");
    expect(a?.id).toBe(b?.id);
  });

  it("expands a registered joint venture to its curated members", () => {
    expect(ids("RailWorks (Alstom – Aktor – Arcada)")).toEqual([
      "railworks",
      "alstom",
      "aktor",
      "arcada-company",
    ]);
  });

  it("names a member that has no registry entry of its own", () => {
    const aktor = resolve("RailWorks (Alstom – Aktor – Arcada)").find(
      (r) => r.id === "aktor",
    );
    expect(aktor).toEqual({ id: "aktor", name: "Aktor", kind: "firm" });
  });

  it("does not split a scope note into fake members", () => {
    expect(
      ids("Alstom: Ilteu – Gurasada signalling and electrification"),
    ).toEqual(["alstom"]);
  });

  it("does not split place names inside a parenthetical", () => {
    expect(ids("Erbașu (Chiribiș–Suplacu de Barcău)")).toEqual(["erbasu"]);
    expect(ids("Max Bögl (Romancierilor – Valea Ialomiței section)")).toEqual([
      "max-bogl",
    ]);
  });

  it("treats a JV label with no listed members as a single firm", () => {
    expect(ids("Comsa (JV, lot 3)")).toEqual(["comsa"]);
  });

  it("deduplicates a firm that appears twice in one string", () => {
    expect(ids("Astaldi – Astaldi SpA")).toEqual(["astaldi"]);
  });
});

describe("attributeLotContractors", () => {
  it("credits builders and skips designers by default", () => {
    const out = attributeLotContractors(
      [
        { name: "Astaldi", role: "builder" },
        { name: "IPTANA București (eng. Vasile Cănuță)", role: "designer" },
      ],
      resolve,
    );
    expect(out.map((c) => c.id)).toEqual(["astaldi"]);
  });

  it("treats an unlabelled contractor as a builder", () => {
    const out = attributeLotContractors([{ name: "Strabag" }], resolve);
    expect(out).toEqual([
      { id: "strabag", name: "Strabag", kind: "firm", role: "builder" },
    ]);
  });

  it("can credit designers when asked", () => {
    const out = attributeLotContractors(
      [{ name: "Anghel Saligny", role: "designer" }],
      resolve,
      { roles: ["designer"] },
    );
    expect(out.map((c) => c.id)).toEqual(["anghel-saligny"]);
  });

  it("omits the joint-venture entity unless requested", () => {
    const firms = attributeLotContractors(
      [{ name: "Astaldi – Max Bögl (JV)", role: "builder" }],
      resolve,
    );
    expect(firms.map((c) => c.id)).toEqual(["astaldi", "max-bogl"]);

    const withJv = attributeLotContractors(
      [{ name: "Astaldi – Max Bögl (JV)", role: "builder" }],
      resolve,
      { includeJointVentures: true },
    );
    expect(withJv.map((c) => c.id)).toEqual([
      "jv:astaldi+max-bogl",
      "astaldi",
      "max-bogl",
    ]);
  });

  it("counts a firm once when it is listed both alone and inside a JV", () => {
    const out = attributeLotContractors(
      [
        { name: "Astaldi (lot 4)", role: "builder" },
        { name: "Astaldi – Max Bögl (JV)", role: "builder" },
      ],
      resolve,
    );
    expect(out.map((c) => c.id)).toEqual(["astaldi", "max-bogl"]);
  });

  it("returns nothing for a lot with no contractors", () => {
    expect(attributeLotContractors(undefined, resolve)).toEqual([]);
  });
});
