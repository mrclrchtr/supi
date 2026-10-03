import { extname, resolve } from "node:path";
import {
  type CodeRequestControl,
  type CodeSymbol,
  isCodeRequestInterruption,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
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

const LATEX_EXTENSIONS = new Set([".tex", ".sty", ".cls"]);
const LATEX_SECTION_KINDS = new Set([
  "module",
  "part",
  "chapter",
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
  "subparagraph",
]);
const TEXLAB_COMMAND_NAME = /^define\s+(\\\S+)$/;

/** Map LaTeX outline and Texlab kinds to file-local identities. */
export function canonicalFileDeclarationKind(
  file: string,
  kind: string | null,
  name: string | null,
): string | undefined {
  if (!LATEX_EXTENSIONS.has(extname(file).toLowerCase())) return undefined;

  const normalized = (kind ?? "").toLowerCase();
  if (LATEX_SECTION_KINDS.has(normalized)) return "latex-section";
  if (normalized === "command") return "latex-command";
  if (normalized === "key" && TEXLAB_COMMAND_NAME.test(name ?? "")) return "latex-command";
  return undefined;
}

/** Match Texlab's `define \\command` name to the grammar's command name. */
export function canonicalFileDeclarationName(
  file: string,
  kind: string | null,
  name: string | null,
): string | null {
  if (LATEX_EXTENSIONS.has(extname(file).toLowerCase()) && kind?.toLowerCase() === "key") {
    return TEXLAB_COMMAND_NAME.exec(name ?? "")?.[1] ?? name;
  }
  return name;
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

/** Identity fields used to order otherwise-equal declarations on one line. */
export interface DeclarationOccurrenceCandidate {
  readonly name: string | null;
  readonly identityKind: string;
  readonly declarationAnchor: { readonly line: number; readonly character: number };
  readonly nameAnchor?: { readonly line: number; readonly character: number } | null;
  readonly container: string | null;
}

/** Assign source-order occurrences after one sort for each identity group. */
export function declarationOccurrencesFor(
  candidates: readonly DeclarationOccurrenceCandidate[],
): number[] {
  const groups = new Map<
    string,
    Array<{ candidate: DeclarationOccurrenceCandidate; index: number }>
  >();
  candidates.forEach((candidate, index) => {
    const key = JSON.stringify([
      candidate.name,
      candidate.identityKind,
      candidate.container,
      candidate.declarationAnchor.line,
    ]);
    const group = groups.get(key);
    if (group) group.push({ candidate, index });
    else groups.set(key, [{ candidate, index }]);
  });

  const occurrences = new Array<number>(candidates.length);
  for (const group of groups.values()) {
    group.sort(
      (left, right) =>
        compareDeclarationOccurrenceCandidates(left.candidate, right.candidate) ||
        left.index - right.index,
    );
    group.forEach(({ index }, occurrence) => {
      occurrences[index] = occurrence;
    });
  }
  return occurrences;
}

/** Return the shared source-order occurrence for one selected declaration. */
export function declarationOccurrenceFor(
  selected: DeclarationOccurrenceCandidate,
  candidates: readonly DeclarationOccurrenceCandidate[],
): number {
  const index = candidates.indexOf(selected);
  if (index < 0) throw new Error("The selected declaration is not in the occurrence set.");
  const occurrence = declarationOccurrencesFor(candidates)[index];
  if (occurrence === undefined) throw new Error("The declaration occurrence was not assigned.");
  return occurrence;
}

function compareDeclarationOccurrenceCandidates(
  left: DeclarationOccurrenceCandidate,
  right: DeclarationOccurrenceCandidate,
): number {
  return (
    left.declarationAnchor.character - right.declarationAnchor.character ||
    (left.nameAnchor?.character ?? 0) - (right.nameAnchor?.character ?? 0)
  );
}

/**
 * Resolve an identity kind without rewriting the provider-reported display kind.
 * An LSP `Variable` becomes `type` only when Tree-sitter reports the exact name
 * anchor inside a type-alias declaration.
 */
export async function resolveDeclarationIdentityKind(
  observation: DeclarationIdentityObservation,
  structural: Pick<StructuralProvider, "nodeAt"> | undefined,
  control?: CodeRequestControl,
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
  } catch (error) {
    if (isCodeRequestInterruption(error, control)) throw error;
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
  control?: CodeRequestControl,
): (symbol: CodeSymbol) => Promise<DeclarationOccurrenceIdentity> {
  const identities = new Map<CodeSymbol, Promise<DeclarationIdentityResult>>();
  const occurrences = new Map<CodeSymbol, Promise<DeclarationOccurrenceIdentity>>();
  const occurrenceSets = new Map<
    CodeSymbol,
    Promise<Map<CodeSymbol, DeclarationOccurrenceIdentity>>
  >();

  const resolveIdentity = (symbol: CodeSymbol): Promise<DeclarationIdentityResult> => {
    const existing = identities.get(symbol);
    if (existing !== undefined) return existing;
    const identity = resolveDeclarationIdentityKind(
      {
        file,
        name: symbol.name,
        providerKind: symbol.kind,
        nameAnchor: symbol.nameAnchor ?? null,
      },
      structural,
      control,
    );
    identities.set(symbol, identity);
    return identity;
  };

  return (symbol) => {
    const existing = occurrences.get(symbol);
    if (existing !== undefined) return existing;
    let occurrenceSet = occurrenceSets.get(symbol);
    if (!occurrenceSet) {
      const peers = allSymbols.filter(
        (candidate) =>
          candidate.name === symbol.name &&
          (candidate.container ?? null) === (symbol.container ?? null) &&
          candidate.declarationAnchor.line === symbol.declarationAnchor.line,
      );
      occurrenceSet = resolveCodeSymbolOccurrences(peers, resolveIdentity);
      for (const peer of peers) occurrenceSets.set(peer, occurrenceSet);
    }
    const occurrence = occurrenceSet.then((resolved) => {
      const identity = resolved.get(symbol);
      if (!identity) throw new Error("The symbol is not in its declaration set.");
      return identity;
    });
    occurrences.set(symbol, occurrence);
    return occurrence;
  };
}

async function resolveCodeSymbolOccurrences(
  symbols: readonly CodeSymbol[],
  resolveIdentity: (symbol: CodeSymbol) => Promise<DeclarationIdentityResult>,
): Promise<Map<CodeSymbol, DeclarationOccurrenceIdentity>> {
  const observed = await Promise.all(
    symbols.map(async (symbol) => ({ symbol, identity: await resolveIdentity(symbol) })),
  );
  const candidates = observed.map(({ symbol, identity }) => ({
    name: symbol.name,
    identityKind: identity.identityKind,
    declarationAnchor: symbol.declarationAnchor,
    nameAnchor: symbol.nameAnchor ?? null,
    container: symbol.container ?? null,
  }));
  const occurrences = declarationOccurrencesFor(candidates);
  const resolved = new Map<CodeSymbol, DeclarationOccurrenceIdentity>();
  observed.forEach(({ symbol, identity }, index) => {
    const declarationOccurrence = occurrences[index];
    if (declarationOccurrence === undefined) {
      throw new Error("The declaration occurrence was not assigned.");
    }
    resolved.set(symbol, { ...identity, declarationOccurrence });
  });
  return resolved;
}

/** Refine one semantic target with exact structural type-alias evidence. */
export async function refineTypeAliasIdentity(
  target: ResolvedTargetData,
  structural: Pick<StructuralProvider, "nodeAt"> | undefined,
  control?: CodeRequestControl,
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
    control,
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
  control?: CodeRequestControl,
): Promise<TargetOutcome> {
  if (outcome.kind === "resolved") {
    return {
      kind: "resolved",
      target: await refineTypeAliasIdentity(outcome.target, structural, control),
    };
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
        control,
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
