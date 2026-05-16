// Target resolution — resolve symbol references to concrete file positions
// for semantic actions (callers, callees, implementations, affected).
// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: anchored, symbol, and file-surface target resolution intentionally live together to share resolution helpers

import * as fs from "node:fs";
import * as path from "node:path";
import { isWithinOrEqual } from "@mrclrchtr/supi-core";
import { getSessionLspService, type Position, type SessionLspService } from "@mrclrchtr/supi-lsp";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter";
import { escapeRegex, normalizePath } from "./search-helpers.ts";
import { highestConfidence } from "./semantic-action-helpers.ts";
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
  return { line: line - 1, character: character - 1 };
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
      message: `File type not supported for semantic analysis: \`${file}\`. Try \`code_intel pattern\` for text search.`,
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
): Promise<{ kind: "resolved"; group: ResolvedTargetGroup } | { kind: "error"; message: string }> {
  const resolvedFile = normalizePath(file, cwd);

  if (!fs.existsSync(resolvedFile)) {
    return { kind: "error", message: `File not found: \`${file}\`` };
  }

  if (isBinaryFile(resolvedFile)) {
    return {
      kind: "error",
      message: `File type not supported for semantic analysis: \`${file}\`. Try \`code_intel pattern\` for text search.`,
    };
  }

  const relPath = path.relative(cwd, resolvedFile);
  const structuralTargets = await resolveFileTargetsViaTreeSitter(relPath, resolvedFile, cwd);
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
 * Uses LSP workspace symbols when available, falls back to Tree-sitter/text search.
 */
export async function resolveSymbolTarget(
  symbol: string,
  cwd: string,
  options?: {
    path?: string;
    kind?: string;
    exportedOnly?: boolean;
  },
): Promise<TargetResolutionResult> {
  const lspState = getSessionLspService(cwd);

  if (lspState.kind === "ready") {
    return resolveSymbolViaLsp(symbol, cwd, lspState.service, options);
  }

  if (lspState.kind === "pending") {
    // In v1, we may wait for LSP. For now, try structural fallback.
  }

  // Structural fallback via text search
  return resolveSymbolViaSearch(symbol, cwd, options);
}

async function resolveSymbolViaLsp(
  symbol: string,
  cwd: string,
  lsp: SessionLspService,
  options?: { path?: string; kind?: string; exportedOnly?: boolean },
): Promise<TargetResolutionResult> {
  const results = await lsp.workspaceSymbol(symbol);
  if (!results || results.length === 0) {
    return { kind: "error", message: `Symbol not found: \`${symbol}\`` };
  }

  // Filter by path scope
  const scopePath = options?.path ? normalizePath(options.path, cwd) : null;
  let candidates = results.filter((s) => {
    if (!("location" in s) || !s.location) return false;
    const uri = s.location.uri;
    const filePath = uri.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : uri;
    if (scopePath && !isWithinOrEqual(scopePath, filePath)) return false;
    return true;
  });

  // Filter by kind
  if (options?.kind) {
    const kindLower = options.kind.toLowerCase();
    candidates = candidates.filter((s) => {
      const symbolKind = symbolKindName(s.kind);
      return symbolKind.toLowerCase().includes(kindLower);
    });
  }

  // Filter to exported symbols only (heuristic: non-local SymbolKinds)
  if (options?.exportedOnly) {
    candidates = candidates.filter((s) => {
      // LSP workspace symbols don't expose export visibility directly.
      // Filter out SymbolKinds that are typically local/private (Variable, Field, Property).
      const NON_EXPORTED_KINDS = new Set([7, 8, 13]); // Property, Field, Variable
      return !NON_EXPORTED_KINDS.has(s.kind);
    });
  }

  if (candidates.length === 0) {
    return {
      kind: "error",
      message: `Symbol not found: \`${symbol}\`${scopePath ? ` in path \`${options?.path}\`` : ""}`,
    };
  }

  if (candidates.length === 1) {
    const c = candidates[0];
    const loc = "location" in c ? c.location : null;
    if (!loc) {
      return { kind: "error", message: `Symbol not found: \`${symbol}\`` };
    }
    const filePath = loc.uri.startsWith("file://") ? decodeURIComponent(loc.uri.slice(7)) : loc.uri;

    return {
      kind: "resolved",
      target: {
        file: filePath,
        position: loc.range.start,
        displayLine: loc.range.start.line + 1,
        displayCharacter: loc.range.start.character + 1,
        name: c.name,
        kind: symbolKindName(c.kind),
        confidence: "semantic",
      },
    };
  }

  // Multiple candidates — return disambiguation
  const MAX_CANDIDATES = 8;
  const disambiguated = candidates
    .slice(0, MAX_CANDIDATES)
    .map((c, idx) => mapCandidateToDisambiguation(c, idx, cwd));

  return {
    kind: "disambiguation",
    candidates: disambiguated,
    omittedCount: Math.max(0, candidates.length - MAX_CANDIDATES),
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ripgrep-based symbol discovery with pattern parsing
async function resolveSymbolViaSearch(
  symbol: string,
  cwd: string,
  options?: { path?: string; kind?: string; exportedOnly?: boolean },
): Promise<TargetResolutionResult> {
  const { execFileSync } = await import("node:child_process");
  const scopePath = options?.path ? normalizePath(options.path, cwd) : cwd;

  try {
    const exportOnly = options?.exportedOnly;
    const pattern = exportOnly
      ? `export\\s+(function|class|interface|type|const|let|var)\\s+${escapeRegex(symbol)}\\b`
      : `(function|class|interface|type|const|let|var|export)\\s+${escapeRegex(symbol)}\\b`;
    let output: string;
    try {
      output = execFileSync("rg", ["--json", "-m", "10", "-e", pattern, scopePath], {
        encoding: "utf-8",
        cwd,
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err: unknown) {
      // rg exits 1 for no-match; capture stdout if available
      const e = err as { status?: number; stdout?: string };
      output = e.stdout ?? "";
    }

    const matches: Array<{ file: string; line: number; text: string }> = [];
    for (const line of output.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "match" && parsed.data) {
          const filePath = parsed.data.path?.text;
          const lineNum = parsed.data.line_number;
          const text = parsed.data.lines?.text?.trim();
          if (filePath && lineNum) {
            matches.push({ file: filePath, line: lineNum, text: text ?? "" });
          }
        }
      } catch {
        // Skip malformed JSON lines
      }
    }

    if (matches.length === 0) {
      return { kind: "error", message: `Symbol not found: \`${symbol}\`` };
    }

    if (matches.length === 1) {
      const m = matches[0];
      const resolvedFile = path.resolve(cwd, m.file);
      return {
        kind: "resolved",
        target: {
          file: resolvedFile,
          position: { line: m.line - 1, character: 0 },
          displayLine: m.line,
          displayCharacter: 1,
          name: symbol,
          kind: null,
          confidence: "heuristic",
        },
      };
    }

    // Multiple matches — disambiguation
    const disambiguated: DisambiguationCandidate[] = matches.slice(0, 8).map((m, idx) => ({
      name: symbol,
      kind: null,
      container: null,
      file: m.file,
      line: m.line,
      character: 1,
      reason: m.text.slice(0, 80),
      rank: idx + 1,
    }));

    return {
      kind: "disambiguation",
      candidates: disambiguated,
      omittedCount: Math.max(0, matches.length - 8),
    };
  } catch {
    return { kind: "error", message: `Symbol not found: \`${symbol}\`` };
  }
}

async function resolveFileTargetsViaLsp(
  resolvedFile: string,
  cwd: string,
  structuralTargets: ResolvedTarget[] | null,
): Promise<ResolvedTarget[] | null> {
  const lspState = getSessionLspService(cwd);
  if (lspState.kind !== "ready") return null;

  const symbols = await lspState.service.documentSymbols(resolvedFile);
  if (!symbols || symbols.length === 0) {
    return structuralTargets;
  }

  const topLevel = flattenDocumentSymbols(symbols)
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
): Promise<ResolvedTarget[] | null> {
  let tsSession: ReturnType<typeof createTreeSitterSession> | null = null;
  try {
    tsSession = createTreeSitterSession(cwd);
    const exportsResult = await tsSession.exports(relPath);
    if (exportsResult.kind !== "success" || exportsResult.data.length === 0) {
      return null;
    }

    return dedupeTargets(
      exportsResult.data.map((record) =>
        createResolvedTarget({
          file: resolvedFile,
          line: record.range.startLine,
          character: record.range.startCharacter,
          name: record.name,
          kind: record.kind,
          confidence: "structural",
        }),
      ),
    );
  } catch {
    return null;
  } finally {
    tsSession?.dispose();
  }
}

function flattenDocumentSymbols(
  symbols: Array<{
    name: string;
    kind: number;
    selectionRange?: { start: { line: number; character: number } };
    location?: { range: { start: { line: number; character: number } } };
    children?: Array<unknown>;
  }>,
  container: string | null = null,
): Array<{
  name: string;
  kind: string;
  line: number;
  character: number;
  container: string | null;
}> {
  const flattened: Array<{
    name: string;
    kind: string;
    line: number;
    character: number;
    container: string | null;
  }> = [];

  for (const symbol of symbols) {
    const start = symbol.selectionRange?.start ?? symbol.location?.range.start;
    if (!start) continue;

    flattened.push({
      name: symbol.name,
      kind: symbolKindName(symbol.kind),
      line: start.line + 1,
      character: start.character + 1,
      container,
    });

    if (Array.isArray(symbol.children) && symbol.children.length > 0) {
      flattened.push(
        ...flattenDocumentSymbols(
          symbol.children as Array<{
            name: string;
            kind: number;
            selectionRange?: { start: { line: number; character: number } };
            location?: { range: { start: { line: number; character: number } } };
            children?: Array<unknown>;
          }>,
          symbol.name,
        ),
      );
    }
  }

  return flattened;
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

function mapCandidateToDisambiguation(
  c: {
    name: string;
    kind: number;
    containerName?: string | null;
    location?: { uri: string; range: { start: { line: number; character: number } } } | null;
  },
  idx: number,
  cwd: string,
): DisambiguationCandidate {
  const loc = "location" in c ? c.location : null;
  const filePath = loc
    ? loc.uri.startsWith("file://")
      ? decodeURIComponent(loc.uri.slice(7))
      : loc.uri
    : "";
  const relPath = filePath ? path.relative(cwd, filePath) : "";

  return {
    name: c.name,
    kind: symbolKindName(c.kind),
    container: "containerName" in c ? (c.containerName ?? null) : null,
    file: relPath,
    line: loc ? loc.range.start.line + 1 : 0,
    character: loc ? loc.range.start.character + 1 : 0,
    reason: relPath,
    rank: idx + 1,
  };
}

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

/** Map LSP SymbolKind to a human-readable name. */
function symbolKindName(kind: number): string {
  const kinds: Record<number, string> = {
    1: "File",
    2: "Module",
    3: "Namespace",
    4: "Package",
    5: "Class",
    6: "Method",
    7: "Property",
    8: "Field",
    9: "Constructor",
    10: "Enum",
    11: "Interface",
    12: "Function",
    13: "Variable",
    14: "Constant",
    15: "String",
    16: "Number",
    17: "Boolean",
    18: "Array",
    19: "Object",
    20: "Key",
    21: "Null",
    22: "EnumMember",
    23: "Struct",
    24: "Event",
    25: "Operator",
    26: "TypeParameter",
  };
  return kinds[kind] ?? "Unknown";
}
