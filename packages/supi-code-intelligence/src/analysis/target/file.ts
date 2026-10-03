/**
 * File target discovery — collects every evidence-backed declaration in one
 * file after the Target workflow has established semantic readiness.
 *
 * Semantic and structural facts are merged. Semantic facts win duplicate
 * members; structural outline facts may supplement declarations omitted by
 * the language server.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  type CodeRequestControl,
  type DeclarationNesting,
  type DocumentCodeSymbol,
  isCodeRequestInterruption,
  type OutlineData,
  type SemanticProvider as SemanticSubstrate,
  type StructuralProvider as StructuralSubstrate,
} from "@mrclrchtr/supi-code-runtime/api";
import type { AnchorKind } from "../../session/target-store.ts";
import { normalizePath } from "../search/paths.ts";
import {
  reconcileContainer,
  reconcileNesting,
  refineLatexSectionNameAnchor,
} from "./file-refinement.ts";
import {
  canonicalDeclarationKind,
  canonicalFileDeclarationKind,
  canonicalFileDeclarationName,
  declarationOccurrencesFor,
  refineTypeAliasIdentity,
} from "./identity.ts";
import type { ResolvedTargetData, ResolvedTargetGroupData } from "./types.ts";

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".pdf",
  ".doc",
  ".docx",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".node",
]);

export interface DiscoveredTargetData extends ResolvedTargetData {
  /** Provider-backed hierarchy used only for file-result presentation ranking. */
  readonly nesting: DeclarationNesting;
}

interface DiscoveryResult {
  readonly available: boolean;
  readonly targets: DiscoveredTargetData[];
}

/** Validated file-discovery input with its normalized absolute path. */
export type FileDiscoveryValidation =
  | { kind: "valid"; file: string }
  | { kind: "invalid-input"; message: string };

/** Validate a file selector before any semantic startup or provider call. */
export function validateFileTargetDiscovery(file: string, cwd: string): FileDiscoveryValidation {
  const resolvedFile = normalizePath(file, cwd);
  const validationError = validateDiscoveryFile(resolvedFile, file);
  return validationError
    ? { kind: "invalid-input", message: validationError }
    : { kind: "valid", file: resolvedFile };
}

/** Discover a Target group for one file without rendering or registering handles. */
export async function resolveFileTargetGroup(
  file: string,
  cwd: string,
  deps: {
    semantic?: SemanticSubstrate;
    structural?: StructuralSubstrate;
  } = {},
  control?: CodeRequestControl,
): Promise<
  | { kind: "resolved"; group: ResolvedTargetGroupData }
  | { kind: "invalid-input"; message: string }
  | { kind: "unavailable"; message: string }
> {
  const validation = validateFileTargetDiscovery(file, cwd);
  if (validation.kind === "invalid-input") return validation;
  const resolvedFile = validation.file;

  const [semantic, structural] = await Promise.all([
    discoverSemantic(resolvedFile, deps.semantic, deps.structural, control),
    discoverStructural(resolvedFile, deps.structural, control),
  ]);
  if (!semantic.available && !structural.available) {
    const displayFile = path.relative(cwd, resolvedFile) || file;
    return {
      kind: "unavailable",
      message: `Declaration discovery is unavailable for \`${displayFile}\`.`,
    };
  }

  const targets = mergeDiscoveries(structural.targets, semantic.targets);
  const unknownNestingCount = targets.filter((target) => target.nesting === "unknown").length;
  const discoveryProvenance = [
    ...(semantic.available ? (["semantic"] as const) : []),
    ...(structural.available ? (["structural"] as const) : []),
  ];
  return {
    kind: "resolved",
    group: {
      file: resolvedFile,
      displayName: path.relative(cwd, resolvedFile) || resolvedFile,
      targets,
      discoveryProvenance,
      confidence: targetGroupConfidence(targets, discoveryProvenance),
      unknownNestingCount,
    },
  };
}

function targetGroupConfidence(
  targets: readonly ResolvedTargetData[],
  discoveryProvenance: ResolvedTargetGroupData["discoveryProvenance"],
): ResolvedTargetGroupData["confidence"] {
  if (targets.length === 0) {
    return discoveryProvenance.includes("semantic") ? "semantic" : "structural";
  }
  if (targets.some((target) => target.confidence === "unavailable")) return "unavailable";
  if (targets.some((target) => target.confidence === "heuristic")) return "heuristic";
  if (targets.some((target) => target.confidence === "structural")) return "structural";
  return "semantic";
}

function validateDiscoveryFile(resolvedFile: string, requestedFile: string): string | null {
  if (!fs.existsSync(resolvedFile)) return `File not found: \`${requestedFile}\``;
  try {
    if (!fs.statSync(resolvedFile).isFile()) return `Not a file: \`${requestedFile}\``;
  } catch {
    return `Cannot access file: \`${requestedFile}\``;
  }
  if (!BINARY_EXTENSIONS.has(path.extname(resolvedFile).toLowerCase())) return null;
  return `File type not supported for code analysis: \`${requestedFile}\`. Use PI read or grep for explicit filesystem inspection when appropriate.`;
}

async function discoverSemantic(
  file: string,
  semantic: SemanticSubstrate | undefined,
  structural: StructuralSubstrate | undefined,
  control?: CodeRequestControl,
): Promise<DiscoveryResult> {
  if (!semantic) return { available: false, targets: [] };
  try {
    const result = await semantic.documentSymbols(file);
    if (result.kind === "unavailable") return { available: false, targets: [] };
    return {
      available: true,
      targets: await Promise.all(
        result.data.map(async (symbol) => {
          const target = targetFromSymbol(file, symbol);
          const refined = await refineTypeAliasIdentity(target, structural, control);
          return { ...refined, nesting: target.nesting };
        }),
      ),
    };
  } catch (error) {
    if (isCodeRequestInterruption(error, control)) throw error;
    return { available: false, targets: [] };
  }
}

function targetFromSymbol(file: string, symbol: DocumentCodeSymbol): DiscoveredTargetData {
  const anchor = symbol.nameAnchor ?? symbol.declarationAnchor;
  const identityKind = canonicalFileDeclarationKind(file, symbol.kind, symbol.name);
  return {
    file,
    position: { line: anchor.line - 1, character: anchor.character - 1 },
    displayLine: anchor.line,
    displayCharacter: anchor.character,
    declarationAnchor: { ...symbol.declarationAnchor },
    declarationOccurrence: 0,
    name: symbol.name,
    kind: symbol.kind,
    ...(identityKind === undefined ? {} : { identityKind }),
    confidence: "semantic",
    provenance: ["semantic"],
    anchorKind: (symbol.nameAnchor ? "name" : "declaration") as AnchorKind,
    container: symbol.container ?? null,
    nesting: normalizeNesting(symbol.nesting),
  };
}

/** Normalize process-global or legacy provider observations at the discovery seam. */
function normalizeNesting(value: unknown): DeclarationNesting {
  if (value === "top-level" || value === "nested" || value === "unknown") return value;
  return "unknown";
}

async function discoverStructural(
  file: string,
  structural: StructuralSubstrate | undefined,
  control?: CodeRequestControl,
): Promise<DiscoveryResult> {
  if (!structural) return { available: false, targets: [] };
  try {
    const result = await structural.outline(file);
    if (result.kind !== "success") return { available: false, targets: [] };
    return { available: true, targets: flattenOutline(file, result.data) };
  } catch (error) {
    if (isCodeRequestInterruption(error, control)) throw error;
    return { available: false, targets: [] };
  }
}

function flattenOutline(
  file: string,
  items: readonly OutlineData[],
  container: string | null = null,
  nesting: DeclarationNesting = "top-level",
): DiscoveredTargetData[] {
  return items.flatMap((item) => {
    const nameAnchor = item.nameAnchor ?? {
      line: item.startLine,
      character: item.startCharacter,
    };
    const target: DiscoveredTargetData = {
      file,
      position: { line: nameAnchor.line - 1, character: nameAnchor.character - 1 },
      displayLine: nameAnchor.line,
      displayCharacter: nameAnchor.character,
      declarationAnchor: { line: item.startLine, character: item.startCharacter },
      declarationOccurrence: 0,
      name: item.name,
      kind: item.kind,
      identityKind:
        canonicalFileDeclarationKind(file, item.kind, item.name) ??
        canonicalDeclarationKind(item.kind),
      confidence: "structural",
      provenance: ["structural"],
      anchorKind: item.nameAnchor ? "name" : "declaration",
      container,
      nesting,
    };
    return [target, ...flattenOutline(file, item.children ?? [], item.name, "nested")];
  });
}

/**
 * Merge duplicate provider observations without collapsing repeated declarations.
 * Semantic facts win a matched pair while retaining both provider sources.
 */
function mergeDiscoveries(
  structural: readonly DiscoveredTargetData[],
  semantic: readonly DiscoveredTargetData[],
): DiscoveredTargetData[] {
  const unmatchedSemantic = new Set(semantic.map((_target, index) => index));
  const mergedStructural = structural.flatMap((structuralTarget) => {
    const semanticIndex = findSemanticMatch(structuralTarget, semantic, unmatchedSemantic);
    if (semanticIndex === null) return [structuralTarget];
    unmatchedSemantic.delete(semanticIndex);
    const semanticTarget = semantic[semanticIndex];
    const refinedSemantic = refineLatexSectionNameAnchor(semanticTarget, structuralTarget);
    return [
      {
        ...refinedSemantic,
        provenance: ["semantic", "structural"] as const,
        container: reconcileContainer(semanticTarget, structuralTarget),
        nesting: reconcileNesting(semanticTarget.nesting, structuralTarget.nesting),
      },
    ];
  });
  const semanticOnly = semantic.filter((_target, index) => unmatchedSemantic.has(index));
  const sourceOrdered = [...mergedStructural, ...semanticOnly].sort(compareDeclarations);
  const identified = assignDeclarationOccurrences(sourceOrdered);
  return identified.sort(compareFileOrientationDeclarations);
}

function findSemanticMatch(
  structural: DiscoveredTargetData,
  semantic: readonly DiscoveredTargetData[],
  unmatched: ReadonlySet<number>,
): number | null {
  const matches = semantic
    .map((target, index) => ({ target, index }))
    .filter(({ target, index }) => unmatched.has(index) && sameDeclaration(target, structural))
    .sort(
      (left, right) =>
        Math.abs(left.target.declarationAnchor.character - structural.declarationAnchor.character) -
          Math.abs(
            right.target.declarationAnchor.character - structural.declarationAnchor.character,
          ) ||
        left.target.declarationAnchor.character - right.target.declarationAnchor.character ||
        compareDeclarations(left.target, right.target) ||
        (left.target.container ?? "").localeCompare(right.target.container ?? "") ||
        left.target.nesting.localeCompare(right.target.nesting) ||
        left.index - right.index,
    );
  return matches[0]?.index ?? null;
}

function sameDeclaration(left: DiscoveredTargetData, right: DiscoveredTargetData): boolean {
  return (
    canonicalFileDeclarationName(left.file, left.kind, left.name) ===
      canonicalFileDeclarationName(right.file, right.kind, right.name) &&
    compatibleContainerEvidence(left, right) &&
    left.declarationAnchor.line === right.declarationAnchor.line &&
    declarationIdentityKind(left) === declarationIdentityKind(right)
  );
}

/** Container conflicts match only when both providers report the exact declaration anchor. */
function compatibleContainerEvidence(
  left: DiscoveredTargetData,
  right: DiscoveredTargetData,
): boolean {
  return (
    left.container === right.container ||
    left.declarationAnchor.character === right.declarationAnchor.character
  );
}

function assignDeclarationOccurrences(
  targets: readonly DiscoveredTargetData[],
): DiscoveredTargetData[] {
  const candidates = targets.map((target) => ({
    name: target.name,
    identityKind: declarationIdentityKind(target),
    declarationAnchor: target.declarationAnchor,
    nameAnchor: { line: target.displayLine, character: target.displayCharacter },
    container: target.container,
  }));
  const occurrences = declarationOccurrencesFor(candidates);
  return targets.map((target, index) => {
    const declarationOccurrence = occurrences[index];
    if (declarationOccurrence === undefined) {
      throw new Error("The declaration occurrence was not assigned.");
    }
    return { ...target, declarationOccurrence };
  });
}

function declarationIdentityKind(target: ResolvedTargetData): string {
  return (
    target.identityKind ??
    canonicalFileDeclarationKind(target.file, target.kind, target.name) ??
    canonicalDeclarationKind(target.kind)
  );
}

function compareFileOrientationDeclarations(
  left: DiscoveredTargetData,
  right: DiscoveredTargetData,
): number {
  return topLevelRank(left) - topLevelRank(right) || compareDeclarations(left, right);
}

function topLevelRank(target: DiscoveredTargetData): number {
  return target.nesting === "top-level" ? 0 : 1;
}

function compareDeclarations(left: ResolvedTargetData, right: ResolvedTargetData): number {
  return (
    left.displayLine - right.displayLine ||
    left.displayCharacter - right.displayCharacter ||
    (left.name ?? "").localeCompare(right.name ?? "") ||
    (left.kind ?? "").localeCompare(right.kind ?? "")
  );
}
