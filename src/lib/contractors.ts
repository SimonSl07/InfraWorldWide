import { foldText } from "./text";
import type { Contractor, ContractorEntry, ContractorRegistry } from "./schema";

/**
 * Resolving contractor strings to stable identities.
 *
 * Contractor names in the project data are transcribed from award notices and
 * press reports, so the same firm shows up several ways: with a legal suffix
 * ("Astaldi SpA"), with a scope note ("Spedition UMB (north lot 4, …)"), in a
 * different language ("FCC Construction" / "FCC Construcción"), or inside a
 * joint venture ("Geiger – Max Bögl – Comtram (JV)"). Ranking firms by
 * delivery performance needs all of those to collapse onto one identity.
 *
 * The pipeline is: cut a trailing " — " scope note, strip a trailing
 * parenthetical, fold to a slug — consulting data/contractors.json at each
 * step so curated aliases win before information is discarded. Whatever
 * survives is split on joint-venture separators.
 */

export type ContractorKind = "firm" | "jv";

export interface ResolvedContractor {
  id: string;
  name: string;
  kind: ContractorKind;
}

export interface AttributedContractor extends ResolvedContractor {
  role: Contractor["role"];
}

/** "Max Bögl" → "max-bogl", "SA&PE Construct" → "sa-pe-construct". */
export function contractorSlug(name: string): string {
  return foldText(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "aktor" → "Aktor" — a last resort when a member id has no registry entry. */
function deslug(id: string): string {
  return id
    .split("-")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Drops a scope note after a colon: "Alstom: Ilteu – Gurasada signalling" is
 * Alstom, working on a named section. Only the colon marks a note; the en
 * dash (–) separates joint-venture members and must survive.
 *
 * The separator used to be an em dash, which reached the reader unchanged on
 * the project page. No contractor name in the dataset contains a colon, so
 * this is unambiguous.
 */
export function stripScopeNote(name: string): string {
  const cut = name.indexOf(":");
  return (cut === -1 ? name : name.slice(0, cut)).trim();
}

/**
 * Drops trailing parentheticals: "Spedition UMB (north lot 4, Pantelimon–
 * Manolache)" → "Spedition UMB". Runs before JV splitting, so en dashes
 * inside place names never get mistaken for member separators.
 */
export function stripParenthetical(name: string): string {
  let out = name.trim();
  let prev: string;
  do {
    prev = out;
    out = out.replace(/\s*\([^()]*\)\s*$/, "").trim();
  } while (out !== prev && out.length > 0);
  return out;
}

/**
 * Splits a joint venture into member names. Separators are a spaced en dash
 * and a spaced slash — never "&", which appears inside firm names
 * ("SA&PE Construct", "Impresa Pizzarotti & C.").
 */
export function splitJointVenture(name: string): string[] {
  return name
    .split(/\s+–\s+|\s+\/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export type ContractorResolver = (raw: string) => ResolvedContractor[];

/**
 * Builds a resolver over a curated registry.
 *
 * Returns every identity a raw string should be credited to: a lone firm
 * resolves to itself, a joint venture resolves to the JV *and* each member,
 * so "Astaldi – Max Bögl (JV)" counts toward Astaldi and Max Bögl as well as
 * the pairing. Callers that want firms only can filter on `kind`.
 */
export function createContractorResolver(
  registry: ContractorRegistry,
): ContractorResolver {
  const byKey = new Map<string, ContractorEntry>();
  const byId = new Map<string, ContractorEntry>();

  for (const entry of registry.contractors) {
    byId.set(entry.id, entry);
    byKey.set(entry.id, entry);
    byKey.set(contractorSlug(entry.name), entry);
    for (const alias of entry.aliases ?? []) {
      byKey.set(contractorSlug(alias), entry);
    }
  }

  const named = (id: string): ResolvedContractor => ({
    id,
    name: byId.get(id)?.name ?? deslug(id),
    kind: byId.get(id)?.members ? "jv" : "firm",
  });

  /** Expands a registry entry, recursing into JV members. */
  const expand = (
    entry: ContractorEntry,
    seen: Set<string>,
  ): ResolvedContractor[] => {
    if (seen.has(entry.id)) return [];
    seen.add(entry.id);

    if (!entry.members) {
      return [{ id: entry.id, name: entry.name, kind: "firm" }];
    }
    const out: ResolvedContractor[] = [
      { id: entry.id, name: entry.name, kind: "jv" },
    ];
    for (const memberId of entry.members) {
      const member = byId.get(memberId);
      // A member may itself be a registered JV, so recurse rather than assume.
      if (member) out.push(...expand(member, seen));
      else if (!seen.has(memberId)) {
        seen.add(memberId);
        out.push(named(memberId));
      }
    }
    return out;
  };

  const resolveOne = (raw: string, seen: Set<string>): ResolvedContractor[] => {
    const scoped = stripScopeNote(raw);
    const bare = stripParenthetical(scoped);

    // Curated aliases win at every stage, before detail is thrown away —
    // "Webuild (Astaldi)" must hit Astaldi before the parenthetical is cut.
    for (const candidate of [raw, scoped, bare]) {
      const entry = byKey.get(contractorSlug(candidate));
      if (entry) return expand(entry, seen);
    }

    const parts = splitJointVenture(bare);
    if (parts.length < 2) {
      const id = contractorSlug(bare);
      if (id.length === 0 || seen.has(id)) return [];
      seen.add(id);
      return [{ id, name: bare, kind: "firm" }];
    }

    // An unregistered joint venture: credit the pairing under a synthetic id
    // built from its members, so the same combination always collapses
    // together however the source happened to order the names.
    const members = parts.flatMap((p) => resolveOne(p, seen));
    const memberIds = members
      .filter((m) => m.kind === "firm")
      .map((m) => m.id)
      .sort();
    const jvId = `jv:${memberIds.join("+")}`;
    if (memberIds.length < 2 || seen.has(jvId)) return members;
    seen.add(jvId);
    return [{ id: jvId, name: bare, kind: "jv" }, ...members];
  };

  return (raw) => resolveOne(raw, new Set());
}

export interface AttributionOptions {
  /** Roles credited with delivery performance. Defaults to builders only. */
  roles?: ReadonlyArray<NonNullable<Contractor["role"]>>;
  /** Include the joint-venture entity itself, not just member firms. */
  includeJointVentures?: boolean;
}

const DEFAULT_ROLES = ["builder"] as const;

/**
 * The identities a lot's outcome should be credited to.
 *
 * Designers are excluded by default: a construction cost overrun belongs to
 * whoever built the thing. Entries are deduplicated, so a firm listed both
 * alone and inside a JV on the same lot is counted once.
 */
export function attributeLotContractors(
  contractors: Contractor[] | undefined,
  resolve: ContractorResolver,
  opts: AttributionOptions = {},
): AttributedContractor[] {
  const roles = opts.roles ?? DEFAULT_ROLES;
  const out: AttributedContractor[] = [];
  const seen = new Set<string>();

  for (const contractor of contractors ?? []) {
    // An unlabelled contractor is a builder in practice — the role field is
    // only filled in when a source distinguishes design from construction.
    const role = contractor.role ?? "builder";
    if (!roles.includes(role)) continue;

    for (const resolved of resolve(contractor.name)) {
      if (resolved.kind === "jv" && !opts.includeJointVentures) continue;
      if (seen.has(resolved.id)) continue;
      seen.add(resolved.id);
      out.push({ ...resolved, role });
    }
  }
  return out;
}
