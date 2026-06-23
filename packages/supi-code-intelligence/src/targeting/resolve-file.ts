/**
 * File-surface target resolution — discovers actionable targets within a file
 * using injected semantic (LSP document symbols) and structural (Tree-sitter exports)
 * substrates with explicit fallback policy.
 *
 * Policy: LSP document symbols preferred (semantic). Falls back to Tree-sitter
 * exports (structural) when LSP is unavailable or returns no results.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  SemanticProvider as SemanticSubstrate,
  StructuralProvider as StructuralSubstrate,
} from "@mrclrchtr/supi-code-runtime/api";
import { getCodeProvider } from "../analysis/context/request-context.ts";
import { normalizePath } from "../search-helpers.ts";
import { highestConfidence } from "../semantic-action-helpers.ts";
import type { AnchorKind } from "../workflow/target-store.ts";
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

function isBinaryFile(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * Resolve a file into a group of discoverable targets.
 *
 * @param file - the file path (absolute or cwd-relative)
 * @param cwd - session working directory
 * @param deps - injected substrates (both optional)
 * @returns typed group outcome or error
 */
export async function resolveFileTargetGroup(
  file: string,
  cwd: string,
  deps: {
    semantic?: SemanticSubstrate;
    structural?: StructuralSubstrate;
  } = {},
): Promise<
  { kind: "resolved"; group: ResolvedTargetGroupData } | { kind: "error"; message: string }
> {
  const resolvedFile = normalizePath(file, cwd);

  if (!fs.existsSync(resolvedFile)) {
    return { kind: "error", message: `File not found: \`${file}\`` };
  }

  if (isBinaryFile(resolvedFile)) {
    return {
      kind: "error",
      message: `File type not supported for semantic analysis: \`${file}\`. Use \`code_find\` with \`mode: "text"\` for explicit text search.`,
    };
  }

  const relPath = path.relative(cwd, resolvedFile);

  // Try structure-based discovery first (faster, no LSP needed)
  const structuralTargets = await resolveViaStructral(relPath, resolvedFile, cwd, deps.structural);

  // Try semantic discovery (richer), preferring it over structural
  const semanticTargets = await resolveViaSemantic(resolvedFile, deps.semantic, structuralTargets);

  const targets = semanticTargets ?? structuralTargets;

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
      confidence: highestConfidence(targets.map((t) => t.confidence)),
    },
  };
}

// ── Resolution helpers ───────────────────────────────────────────────

async function resolveViaSemantic(
  resolvedFile: string,
  semantic?: SemanticSubstrate,
  structuralTargets: ResolvedTargetData[] | null = null,
): Promise<ResolvedTargetData[] | null> {
  if (!semantic) return structuralTargets;

  try {
    const symbols = await semantic.documentSymbols(resolvedFile);
    if (!symbols || symbols.length === 0) return structuralTargets;

    const topLevel = symbols
      .filter((s) => !s.container)
      .map((s) => {
        const a = s.nameAnchor ?? s.declarationAnchor;
        return {
          file: resolvedFile,
          position: { line: a.line - 1, character: a.character - 1 },
          displayLine: a.line,
          displayCharacter: a.character,
          name: s.name,
          kind: s.kind,
          confidence: "semantic" as const,
          anchorKind: (s.nameAnchor ? "name" : "declaration") as AnchorKind,
          container: s.container ?? null,
        };
      });

    if (topLevel.length === 0) return structuralTargets;

    // Semantic symbols are available — prefer them over structural exports.
    // Only fall back to structural targets that have no semantic counterpart
    // (different position).
    if (!structuralTargets || structuralTargets.length === 0) return dedupeTargets(topLevel);

    // Build a position-based dedup: for each position, prefer the semantic entry.
    const byPos = new Map<string, ResolvedTargetData>();
    for (const t of structuralTargets) {
      byPos.set(`${t.position.line}:${t.position.character}`, t);
    }
    for (const t of topLevel) {
      byPos.set(`${t.position.line}:${t.position.character}`, t);
    }
    return [...byPos.values()];
  } catch {
    return structuralTargets;
  }
}

async function resolveViaStructral(
  relPath: string,
  resolvedFile: string,
  cwd: string,
  structural?: StructuralSubstrate,
): Promise<ResolvedTargetData[] | null> {
  // Resolve a substrate to use — prefer injected, fall back to auto-created
  const substrate = structural ?? createFallbackSubstrate(cwd);
  if (!substrate) return null;

  try {
    const exportsResult = await substrate.exports(relPath);
    if (exportsResult.kind !== "success" || exportsResult.data.length === 0) return null;

    return dedupeTargets(
      exportsResult.data.map((record) => ({
        file: resolvedFile,
        position: { line: record.startLine - 1, character: record.startCharacter - 1 },
        displayLine: record.startLine,
        displayCharacter: record.startCharacter,
        name: record.name,
        kind: record.kind,
        confidence: "structural" as const,
        // Structural exports use the node start (startLine/startCharacter) =
        // declaration anchor; no name anchor is derivable from exports alone.
        anchorKind: "declaration",
        container: null,
      })),
    );
  } catch {
    return null;
  }
}

/** Create a fallback substrate from a working directory using the unified registry. */
function createFallbackSubstrate(dir: string): StructuralSubstrate | null {
  const state = getCodeProvider(dir);
  return state.kind === "ready" ? state.provider : null;
}

function dedupeTargets(targets: ResolvedTargetData[]): ResolvedTargetData[] {
  const deduped = new Map<string, ResolvedTargetData>();
  for (const target of targets) {
    const key = `${target.name ?? ""}:${target.displayLine}:${target.displayCharacter}`;
    if (!deduped.has(key)) {
      deduped.set(key, target);
    }
  }
  return [...deduped.values()];
}
