import { resolve } from "node:path";
import type { CodeSymbol, StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";
import type { ResolvedTargetData, TargetOutcome } from "./types.ts";

/**
 * Normalize provider-specific declaration kinds into stable identity families.
 * Display kinds remain untouched; this value is used only for matching and
 * target-handle identity across semantic/structural observations.
 */
export function canonicalDeclarationKind(kind: string | null): string {
  const normalized = (kind ?? "").toLowerCase();
  if (
    ["function", "variable", "constant", "field", "field-function", "property"].includes(normalized)
  ) {
    return "value";
  }
  if (["method", "constructor"].includes(normalized)) return "member";
  return normalized;
}

/** Exact declaration-name observation used to derive provider-independent identity. */
export interface DeclarationIdentityObservation {
  readonly file: string;
  readonly name: string | null;
  readonly providerKind: string | null;
  readonly nameAnchor: { readonly line: number; readonly character: number } | null;
}

/** Evidence-backed canonical kind and whether structural syntax established it. */
export interface DeclarationIdentityResult {
  readonly identityKind: string;
  readonly structuralEvidence: boolean;
}

/** Canonical identity plus the same-line occurrence used by Target handles. */
export interface DeclarationOccurrenceIdentity extends DeclarationIdentityResult {
  readonly declarationOccurrence: number;
}

/**
 * Resolve an identity kind without rewriting the provider-reported display kind.
 * An LSP `Variable` becomes `type` only when Tree-sitter reports the exact name
 * anchor inside a type-alias declaration.
 */
export async function resolveDeclarationIdentityKind(
  observation: DeclarationIdentityObservation,
  structural: Pick<StructuralProvider, "nodeAt"> | undefined,
): Promise<DeclarationIdentityResult> {
  const identityKind = canonicalDeclarationKind(observation.providerKind);
  if (
    !structural ||
    observation.providerKind?.toLowerCase() !== "variable" ||
    !observation.nameAnchor
  ) {
    return { identityKind, structuralEvidence: false };
  }
  try {
    const { line, character } = observation.nameAnchor;
    const result = await structural.nodeAt(observation.file, line, character);
    if (result.kind !== "success") return { identityKind, structuralEvidence: false };
    const node = result.data;
    const exactNameAnchor =
      node.text === observation.name &&
      node.startLine === line &&
      node.startCharacter === character;
    const isTypeAlias =
      node.type === "type_identifier" &&
      node.ancestry.some((ancestor) => ancestor.type === "type_alias_declaration");
    return exactNameAnchor && isTypeAlias
      ? { identityKind: "type", structuralEvidence: true }
      : { identityKind, structuralEvidence: false };
  } catch {
    return { identityKind, structuralEvidence: false };
  }
}

/**
 * Build an evidence-backed identity resolver for one semantic declaration set.
 * Results are cached so disambiguation candidates share structural observations.
 */
export function createCodeSymbolIdentityResolver(
  file: string,
  allSymbols: readonly CodeSymbol[],
  structural: Pick<StructuralProvider, "nodeAt"> | undefined,
): (symbol: CodeSymbol) => Promise<DeclarationOccurrenceIdentity> {
  const identities = new Map<CodeSymbol, Promise<DeclarationIdentityResult>>();
  const occurrences = new Map<CodeSymbol, Promise<DeclarationOccurrenceIdentity>>();

  const resolveIdentity = (symbol: CodeSymbol): Promise<DeclarationIdentityResult> => {
    const existing = identities.get(symbol);
    if (existing) return existing;
    const identity = resolveDeclarationIdentityKind(
      {
        file,
        name: symbol.name,
        providerKind: symbol.kind,
        nameAnchor: symbol.nameAnchor ?? null,
      },
      structural,
    );
    identities.set(symbol, identity);
    return identity;
  };

  return (symbol) => {
    const existing = occurrences.get(symbol);
    if (existing) return existing;
    const occurrence = resolveCodeSymbolOccurrence(symbol, allSymbols, resolveIdentity);
    occurrences.set(symbol, occurrence);
    return occurrence;
  };
}

async function resolveCodeSymbolOccurrence(
  symbol: CodeSymbol,
  allSymbols: readonly CodeSymbol[],
  resolveIdentity: (symbol: CodeSymbol) => Promise<DeclarationIdentityResult>,
): Promise<DeclarationOccurrenceIdentity> {
  const peers = allSymbols.filter(
    (candidate) =>
      candidate.name === symbol.name &&
      (candidate.container ?? null) === (symbol.container ?? null) &&
      candidate.declarationAnchor.line === symbol.declarationAnchor.line,
  );
  const observed = await Promise.all(
    peers.map(async (candidate) => ({ candidate, identity: await resolveIdentity(candidate) })),
  );
  const selectedIdentity = await resolveIdentity(symbol);
  const matching = observed
    .filter(({ identity }) => identity.identityKind === selectedIdentity.identityKind)
    .map(({ candidate }) => candidate)
    .sort(compareCodeSymbolDeclarations);
  return {
    ...selectedIdentity,
    declarationOccurrence: Math.max(0, matching.indexOf(symbol)),
  };
}

function compareCodeSymbolDeclarations(left: CodeSymbol, right: CodeSymbol): number {
  return (
    left.declarationAnchor.character - right.declarationAnchor.character ||
    (left.nameAnchor?.character ?? 0) - (right.nameAnchor?.character ?? 0)
  );
}

/** Refine one semantic target with exact structural type-alias evidence. */
export async function refineTypeAliasIdentity(
  target: ResolvedTargetData,
  structural: Pick<StructuralProvider, "nodeAt"> | undefined,
): Promise<ResolvedTargetData> {
  if (target.identityKind !== undefined) return target;
  const identity = await resolveDeclarationIdentityKind(
    {
      file: target.file,
      name: target.name,
      providerKind: target.kind,
      nameAnchor:
        target.anchorKind === "name"
          ? { line: target.displayLine, character: target.displayCharacter }
          : null,
    },
    structural,
  );
  return {
    ...target,
    identityKind: identity.identityKind,
    provenance: identity.structuralEvidence ? ["semantic", "structural"] : target.provenance,
  };
}

/** Refine resolved and candidate identities before Target-handle registration. */
export async function refineTargetOutcomeIdentity(
  outcome: TargetOutcome,
  cwd: string,
  structural: Pick<StructuralProvider, "nodeAt"> | undefined,
): Promise<TargetOutcome> {
  if (outcome.kind === "resolved") {
    return { kind: "resolved", target: await refineTypeAliasIdentity(outcome.target, structural) };
  }
  if (outcome.kind !== "disambiguation" && outcome.kind !== "kind-mismatch") return outcome;

  const observations = await Promise.all(
    outcome.candidates.map(async (candidate) => {
      if (candidate.identityKind !== undefined) {
        return { candidate, identityRefined: false };
      }
      const identity = await resolveDeclarationIdentityKind(
        {
          file: resolve(cwd, candidate.file),
          name: candidate.name,
          providerKind: candidate.kind,
          nameAnchor:
            candidate.anchorKind === "name"
              ? { line: candidate.line, character: candidate.character }
              : null,
        },
        structural,
      );
      return {
        candidate: {
          ...candidate,
          identityKind: identity.identityKind,
          provenance: identity.structuralEvidence
            ? (["semantic", "structural"] as const)
            : (["semantic"] as const),
        },
        identityRefined: true,
      };
    }),
  );
  const candidates = observations.map(({ candidate }) => candidate);
  return {
    ...outcome,
    candidates: observations.some(({ identityRefined }) => identityRefined)
      ? assignCandidateOccurrences(candidates, cwd)
      : candidates,
  };
}

function assignCandidateOccurrences(
  candidates: Extract<TargetOutcome, { kind: "disambiguation" | "kind-mismatch" }>["candidates"],
  cwd: string,
): Extract<TargetOutcome, { kind: "disambiguation" | "kind-mismatch" }>["candidates"] {
  const occurrences = new Map<string, number>();
  return candidates.map((candidate) => {
    const key = [
      resolve(cwd, candidate.file),
      candidate.declarationAnchor.line,
      candidate.name,
      candidate.identityKind ?? canonicalDeclarationKind(candidate.kind),
      candidate.container ?? "",
    ].join("\0");
    const declarationOccurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, declarationOccurrence + 1);
    return { ...candidate, declarationOccurrence };
  });
}
