// Target resolution — resolve symbol references to concrete file positions
// for semantic actions (callers, callees, implementations, affected).
// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: anchored, symbol, and file-surface target resolution intentionally live together to share resolution helpers

import * as fs from "node:fs";
import * as path from "node:path";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/api";
import { type Position, toLspPosition } from "@mrclrchtr/supi-lsp/api";
import { normalizePath } from "./search-helpers.ts";
import { highestConfidence } from "./semantic-action-helpers.ts";
import { createSemanticSubstrate } from "./substrates/lsp-adapter.ts";
import { createStructuralSubstrate } from "./substrates/tree-sitter-adapter.ts";
import type { SemanticSubstrate, StructuralSubstrate } from "./substrates/types.ts";
import type { ConfidenceMode, DisambiguationCandidate } from "./types.ts";

export interface ResolvedTarget {
  file: string;
  /** 0-based position for LSP API */
  position: Position;
  /** 1-based position for user display */
  displayLine: number;
  displayCharacter: number;
  name: string | null;
  kind: string | null;
  confidence: ConfidenceMode;
}

export interface ResolvedTargetGroup {
  file: string;
  displayName: string;
  targets: ResolvedTarget[];
  confidence: ConfidenceMode;
}

export type TargetResolutionResult =
  | { kind: "resolved"; target: ResolvedTarget }
  | { kind: "disambiguation"; candidates: DisambiguationCandidate[]; omittedCount: number }
  | { kind: "error"; message: string };

// Re-export normalizePath for consumers who import from target-resolution
export { normalizePath } from "./search-helpers.ts";

/**
 * Convert 1-based public coordinates to 0-based LSP Position.
 */
export function toZeroBased(line: number, character: number): Position {
  return toLspPosition(line, character);
}

/**
 * Resolve a target from anchored coordinates (file + line + character).
 */
export function resolveAnchoredTarget(
  file: string,
  line: number,
  character: number,
  cwd: string,
): TargetResolutionResult {
  const resolvedFile = normalizePath(file, cwd);

  if (!fs.existsSync(resolvedFile)) {
    return { kind: "error", message: `File not found: \`${file}\`` };
  }

  if (isBinaryFile(resolvedFile)) {
    return {
      kind: "error",
      message: `File type not supported for semantic analysis: \`${file}\`. Use \`code_pattern\` for explicit text search.`,
    };
  }

  const position = toZeroBased(line, character);

  return {
    kind: "resolved",
    target: {
      file: resolvedFile,
      position,
      displayLine: line,
      displayCharacter: character,
      name: null,
      kind: null,
      confidence: "semantic",
    },
  };
}

/**
 * Resolve a file-only request into a group of actionable targets.
 * Prefers LSP document symbols when available and falls back to Tree-sitter export discovery.
 */
export async function resolveFileTargetGroup(
  file: string,
  cwd: string,
  structural?: StructuralSubstrate,
): Promise<{ kind: "resolved"; group: ResolvedTargetGroup } | { kind: "error"; message: string }> {
  const resolvedFile = normalizePath(file, cwd);

  if (!fs.existsSync(resolvedFile)) {
    return { kind: "error", message: `File not found: \`${file}\`` };
  }

  if (isBinaryFile(resolvedFile)) {
    return {
      kind: "error",
      message: `File type not supported for semantic analysis: \`${file}\`. Use \`code_pattern\` for explicit text search.`,
    };
  }

  const relPath = path.relative(cwd, resolvedFile);
  const structuralTargets = await resolveFileTargetsViaTreeSitter(
    relPath,
    resolvedFile,
    cwd,
    structural,
  );
  const lspTargets = await resolveFileTargetsViaLsp(resolvedFile, cwd, structuralTargets);
  const targets = lspTargets ?? structuralTargets;

  if (!targets || targets.length === 0) {
    return {
      kind: "error",
      message:
        `**Error:** File-level semantic exploration is not available for \`${file}\`. ` +
        "Provide `line` and `character`, or a `symbol` for discovery.",
    };
  }

  return {
    kind: "resolved",
    group: {
      file: resolvedFile,
      displayName: relPath,
      targets,
      confidence: highestConfidence(targets.map((target) => target.confidence)),
    },
  };
}

/**
 * Resolve a target from symbol discovery — finds matching declarations.
 * Symbol discovery is semantic-only; it does not fall back to text search.
 */
export async function resolveSymbolTarget(
  symbol: string,
  cwd: string,
  semantic: SemanticSubstrate,
  options?: {
    path?: string;
    kind?: string;
    exportedOnly?: boolean;
  },
): Promise<TargetResolutionResult> {
  return resolveSymbolViaSemantic(symbol, cwd, semantic, options);
}

// New semantic-based symbol resolution using the adapter
async function resolveSymbolViaSemantic(
  symbol: string,
  cwd: string,
  semantic: SemanticSubstrate,
  options?: {
    path?: string;
    kind?: string;
    exportedOnly?: boolean;
  },
): Promise<TargetResolutionResult> {
  const results = await semantic.workspaceSymbols(symbol);
  if (results === null) {
    return {
      kind: "error",
      message: `Symbol discovery for \`${symbol}\` requires active LSP. Use \`file\` + coordinates, or enable LSP and retry.`,
    };
  }
  if (results.length === 0) {
    return { kind: "error", message: `Symbol not found: \`${symbol}\`` };
  }

  // Filter by path scope
  const scopePath = options?.path ? normalizePath(options.path, cwd) : null;
  let candidates = results.filter((s) => {
    if (scopePath && !isWithinOrEqual(scopePath, s.file)) return false;
    return true;
  });

  // Filter by kind
  if (options?.kind) {
    const kindLower = options.kind.toLowerCase();
    candidates = candidates.filter((s) => s.kind.toLowerCase().includes(kindLower));
  }

  // Filter to exported symbols only
  if (options?.exportedOnly) {
    const NON_EXPORTED_KINDS = new Set(["Variable", "Field", "Property"]);
    candidates = candidates.filter((s) => !NON_EXPORTED_KINDS.has(s.kind));
  }

  // Range-less candidates (line=0,char=0) come from URI-only workspace symbols.
  // Keep them for disambiguation but don't promote to single-match resolution.
  const ranged = candidates.filter((s) => s.line > 0 || s.character > 0);
  const _rangeless = candidates.filter((s) => s.line === 0 && s.character === 0);

  if (ranged.length === 1) {
    const c = ranged[0];
    return {
      kind: "resolved",
      target: {
        file: c.file,
        position: { line: c.line - 1, character: c.character - 1 },
        displayLine: c.line,
        displayCharacter: c.character,
        name: c.name,
        kind: c.kind,
        confidence: "semantic",
      },
    };
  }

  // All candidates lost or only rangeless — report error if nothing at all
  if (candidates.length === 0) {
    return {
      kind: "error",
      message: `Symbol not found: \`${symbol}\`${scopePath ? ` in path \`${options?.path}\`` : ""}`,
    };
  }

  // Multiple candidates (or single rangeless) — return disambiguation with all candidates
  const MAX_CANDIDATES = 8;
  const disambiguated = candidates.slice(0, MAX_CANDIDATES).map((c, idx) => ({
    name: c.name,
    kind: c.kind,
    container: c.container ?? null,
    file: path.relative(cwd, c.file),
    line: c.line,
    character: c.character,
    reason: path.relative(cwd, c.file),
    rank: idx + 1,
  }));

  return {
    kind: "disambiguation",
    candidates: disambiguated,
    omittedCount: Math.max(0, candidates.length - MAX_CANDIDATES),
  };
}

async function resolveFileTargetsViaLsp(
  resolvedFile: string,
  cwd: string,
  structuralTargets: ResolvedTarget[] | null,
): Promise<ResolvedTarget[] | null> {
  const lsp = createSemanticSubstrate(cwd);
  const symbols = await lsp.documentSymbols(resolvedFile);
  if (!symbols || symbols.length === 0) {
    return structuralTargets;
  }

  const topLevel = symbols
    .filter((symbol) => !symbol.container)
    .map((symbol) =>
      createResolvedTarget({
        file: resolvedFile,
        line: symbol.line,
        character: symbol.character,
        name: symbol.name,
        kind: symbol.kind,
        confidence: "semantic",
      }),
    );

  if (topLevel.length === 0) {
    return structuralTargets;
  }

  if (!structuralTargets || structuralTargets.length === 0) {
    return dedupeTargets(topLevel);
  }

  const matched = structuralTargets.map((target) => {
    const byName = topLevel.find((candidate) => candidate.name === target.name);
    return byName ?? target;
  });

  return dedupeTargets(matched);
}

async function resolveFileTargetsViaTreeSitter(
  relPath: string,
  resolvedFile: string,
  cwd: string,
  structural?: StructuralSubstrate,
): Promise<ResolvedTarget[] | null> {
  try {
    if (structural) {
      const exportsResult = await structural.exports(relPath);
      if (exportsResult.kind !== "success" || exportsResult.data.length === 0) return null;
      return dedupeTargets(
        exportsResult.data.map((record) =>
          createResolvedTarget({
            file: resolvedFile,
            line: record.startLine,
            character: record.startCharacter,
            name: record.name,
            kind: record.kind,
            confidence: "structural",
          }),
        ),
      );
    }

    // Fallback: create a structural adapter on the fly
    const fallback = createStructuralSubstrate(cwd);
    const exportsResult = await fallback.exports(relPath);
    if (exportsResult.kind !== "success" || exportsResult.data.length === 0) return null;
    return dedupeTargets(
      exportsResult.data.map((record) =>
        createResolvedTarget({
          file: resolvedFile,
          line: record.startLine,
          character: record.startCharacter,
          name: record.name,
          kind: record.kind,
          confidence: "structural",
        }),
      ),
    );
  } catch {
    return null;
  }
}

function createResolvedTarget(input: {
  file: string;
  line: number;
  character: number;
  name: string;
  kind: string | null;
  confidence: ConfidenceMode;
}): ResolvedTarget {
  return {
    file: input.file,
    position: toZeroBased(input.line, input.character),
    displayLine: input.line,
    displayCharacter: input.character,
    name: input.name,
    kind: input.kind,
    confidence: input.confidence,
  };
}

function dedupeTargets(targets: ResolvedTarget[]): ResolvedTarget[] {
  const deduped = new Map<string, ResolvedTarget>();
  for (const target of targets) {
    const key = `${target.name ?? ""}:${target.displayLine}:${target.displayCharacter}`;
    if (!deduped.has(key)) {
      deduped.set(key, target);
    }
  }
  return [...deduped.values()];
}

// ── Helpers ───────────────────────────────────────────────────────────

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

function isBinaryFile(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
