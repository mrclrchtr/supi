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
import type {
  CodeSymbol,
  OutlineData,
  SemanticProvider as SemanticSubstrate,
  StructuralProvider as StructuralSubstrate,
} from "@mrclrchtr/supi-code-runtime/api";
import type { AnchorKind } from "../../session/target-store.ts";
import { normalizePath } from "../search/ripgrep.ts";
import { canonicalDeclarationKind, refineTypeAliasIdentity } from "./identity.ts";
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

interface DiscoveryResult {
  readonly available: boolean;
  readonly targets: ResolvedTargetData[];
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
): Promise<
  | { kind: "resolved"; group: ResolvedTargetGroupData }
  | { kind: "invalid-input"; message: string }
  | { kind: "unavailable"; message: string }
> {
  const validation = validateFileTargetDiscovery(file, cwd);
  if (validation.kind === "invalid-input") return validation;
  const resolvedFile = validation.file;

  const [semantic, structural] = await Promise.all([
    discoverSemantic(resolvedFile, deps.semantic, deps.structural),
    discoverStructural(resolvedFile, deps.structural),
  ]);
  if (!semantic.available && !structural.available) {
    const displayFile = path.relative(cwd, resolvedFile) || file;
    return {
      kind: "unavailable",
      message: `Declaration discovery is unavailable for \`${displayFile}\`.`,
    };
  }

  const targets = mergeDiscoveries(structural.targets, semantic.targets);
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
  return `File type not supported for code analysis: \`${requestedFile}\`. Use \`code_find\` with \`mode: "text"\` for explicit text search.`;
}

async function discoverSemantic(
  file: string,
  semantic: SemanticSubstrate | undefined,
  structural: StructuralSubstrate | undefined,
): Promise<DiscoveryResult> {
  if (!semantic) return { available: false, targets: [] };
  try {
    const symbols = await semantic.documentSymbols(file);
    if (symbols === null) return { available: false, targets: [] };
    return {
      available: true,
      targets: await Promise.all(
        symbols.map((symbol) =>
          refineTypeAliasIdentity(targetFromSymbol(file, symbol), structural),
        ),
      ),
    };
  } catch {
    return { available: false, targets: [] };
  }
}

function targetFromSymbol(file: string, symbol: CodeSymbol): ResolvedTargetData {
  const anchor = symbol.nameAnchor ?? symbol.declarationAnchor;
  return {
    file,
    position: { line: anchor.line - 1, character: anchor.character - 1 },
    displayLine: anchor.line,
    displayCharacter: anchor.character,
    declarationAnchor: { ...symbol.declarationAnchor },
    declarationOccurrence: 0,
    name: symbol.name,
    kind: symbol.kind,
    confidence: "semantic",
    provenance: ["semantic"],
    anchorKind: (symbol.nameAnchor ? "name" : "declaration") as AnchorKind,
    container: symbol.container ?? null,
  };
}

async function discoverStructural(
  file: string,
  structural: StructuralSubstrate | undefined,
): Promise<DiscoveryResult> {
  if (!structural) return { available: false, targets: [] };
  try {
    const result = await structural.outline(file);
    if (result.kind !== "success") return { available: false, targets: [] };
    return { available: true, targets: flattenOutline(file, result.data) };
  } catch {
    return { available: false, targets: [] };
  }
}

function flattenOutline(
  file: string,
  items: readonly OutlineData[],
  container: string | null = null,
): ResolvedTargetData[] {
  return items.flatMap((item) => {
    const target: ResolvedTargetData = {
      file,
      position: { line: item.startLine - 1, character: item.startCharacter - 1 },
      displayLine: item.startLine,
      displayCharacter: item.startCharacter,
      declarationAnchor: { line: item.startLine, character: item.startCharacter },
      declarationOccurrence: 0,
      name: item.name,
      kind: item.kind,
      identityKind: canonicalDeclarationKind(item.kind),
      confidence: "structural",
      provenance: ["structural"],
      anchorKind: "declaration",
      container,
    };
    return [target, ...flattenOutline(file, item.children ?? [], item.name)];
  });
}

/**
 * Merge duplicate provider observations without collapsing repeated declarations.
 * Semantic facts win a matched pair while retaining both provider sources.
 */
function mergeDiscoveries(
  structural: readonly ResolvedTargetData[],
  semantic: readonly ResolvedTargetData[],
): ResolvedTargetData[] {
  const unmatchedSemantic = new Set(semantic.map((_target, index) => index));
  const mergedStructural = structural.flatMap((structuralTarget) => {
    const semanticIndex = findSemanticMatch(structuralTarget, semantic, unmatchedSemantic);
    if (semanticIndex === null) return [structuralTarget];
    unmatchedSemantic.delete(semanticIndex);
    return [
      {
        ...semantic[semanticIndex],
        provenance: ["semantic", "structural"] as const,
      },
    ];
  });
  const semanticOnly = semantic.filter((_target, index) => unmatchedSemantic.has(index));
  return assignDeclarationOccurrences(
    [...mergedStructural, ...semanticOnly].sort(compareDeclarations),
  );
}

function findSemanticMatch(
  structural: ResolvedTargetData,
  semantic: readonly ResolvedTargetData[],
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
          ) || left.index - right.index,
    );
  return matches[0]?.index ?? null;
}

function sameDeclaration(left: ResolvedTargetData, right: ResolvedTargetData): boolean {
  return (
    left.name === right.name &&
    left.container === right.container &&
    left.declarationAnchor.line === right.declarationAnchor.line &&
    declarationIdentityKind(left) === declarationIdentityKind(right)
  );
}

function assignDeclarationOccurrences(
  targets: readonly ResolvedTargetData[],
): ResolvedTargetData[] {
  const occurrences = new Map<string, number>();
  return targets.map((target) => {
    const key = [
      target.declarationAnchor.line,
      target.name ?? "",
      declarationIdentityKind(target),
      target.container ?? "",
    ].join("\0");
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    return { ...target, declarationOccurrence: occurrence };
  });
}

function declarationIdentityKind(target: ResolvedTargetData): string {
  return target.identityKind ?? canonicalDeclarationKind(target.kind);
}

function compareDeclarations(left: ResolvedTargetData, right: ResolvedTargetData): number {
  return (
    left.displayLine - right.displayLine ||
    left.displayCharacter - right.displayCharacter ||
    (left.name ?? "").localeCompare(right.name ?? "") ||
    (left.kind ?? "").localeCompare(right.kind ?? "")
  );
}
