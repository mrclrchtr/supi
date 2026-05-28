/**
 * Tool executor for code_find.
 *
 * Unified ranked code search with mode dispatch:
 * - text (default): literal ripgrep
 * - regex: ripgrep regex
 * - ast: tree-sitter structured search
 * - semantic: LSP workspace symbols with text fallback
 */

import { existsSync } from "node:fs";
import { getCodeProvider } from "../analysis/context/request-context.ts";
import { normalizePath } from "../search-helpers.ts";
import type { CodeIntelResult, SearchDetails } from "../types.ts";
import { executePattern } from "../use-case/generate-pattern.ts";

export interface CodeFindToolParams {
  query: string;
  scope?: string;
  mode?: "text" | "regex" | "ast" | "semantic";
  kind?: "definition" | "import" | "export" | "call" | "type" | "test";
  contextLines?: number;
  maxResults?: number;
}

/** Structured pattern kinds supported by tree-sitter. */
const STRUCTURED_KINDS = new Set(["definition", "export", "import"]);

export async function executeFindTool(
  params: CodeFindToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const cwd = ctx.cwd;

  // ── Validation ──────────────────────────────────────────────────
  if (!params.query || params.query.trim().length === 0) {
    return {
      content: "**Error:** `code_find` requires a non-empty `query` parameter.",
      details: undefined,
    };
  }

  const scopePath = resolveScope(params.scope, cwd);
  if (scopePath === null && params.scope) {
    return {
      content: `**Error:** Scope path not found: \`${params.scope}\``,
      details: undefined,
    };
  }

  const mode = params.mode ?? "text";
  const query = params.query;

  // ── Mode dispatch ───────────────────────────────────────────────
  switch (mode) {
    case "text":
      return executeTextMode(query, params, scopePath, cwd);
    case "regex":
      return executeRegexMode(query, params, scopePath, cwd);
    case "ast":
      return executeAstMode(query, params, scopePath, cwd);
    case "semantic":
      return executeSemanticMode(query, params, scopePath, cwd);
  }
}

// ── Mode implementations ──────────────────────────────────────────────

async function executeTextMode(
  query: string,
  params: CodeFindToolParams,
  _scopePath: string | null,
  cwd: string,
): Promise<CodeIntelResult> {
  const result = await executePattern(
    {
      pattern: query,
      path: params.scope,
      regex: false,
      kind: undefined,
      maxResults: params.maxResults ?? 8,
      contextLines: params.contextLines ?? 1,
    },
    { cwd, provider: getEffectiveProvider(cwd) },
  );

  return maybeAppendKindNote(result, params);
}

async function executeRegexMode(
  query: string,
  params: CodeFindToolParams,
  _scopePath: string | null,
  cwd: string,
): Promise<CodeIntelResult> {
  const result = await executePattern(
    {
      pattern: query,
      path: params.scope,
      regex: true,
      kind: undefined,
      maxResults: params.maxResults ?? 8,
      contextLines: params.contextLines ?? 1,
    },
    { cwd, provider: getEffectiveProvider(cwd) },
  );

  return maybeAppendKindNote(result, params);
}

async function executeAstMode(
  query: string,
  params: CodeFindToolParams,
  _scopePath: string | null,
  cwd: string,
): Promise<CodeIntelResult> {
  // Check for unsupported kind values first
  if (params.kind && !STRUCTURED_KINDS.has(params.kind)) {
    return {
      content: `**Error:** Structured \`kind: "${params.kind}"\` is not yet implemented. Supported kinds for \`mode: "ast"\`: \`definition\`, \`export\`, \`import\`.`,
      details: undefined,
    };
  }

  const kind = params.kind ?? "definition";

  return executePattern(
    {
      pattern: query,
      path: params.scope,
      kind,
      maxResults: params.maxResults ?? 8,
      contextLines: params.contextLines ?? 1,
    },
    { cwd, provider: getEffectiveProvider(cwd) },
  );
}

async function executeSemanticMode(
  query: string,
  params: CodeFindToolParams,
  scopePath: string | null,
  cwd: string,
): Promise<CodeIntelResult> {
  // Reject unsupported kind values before attempting LSP lookup
  if (params.kind && !STRUCTURED_KINDS.has(params.kind)) {
    return {
      content: `**Error:** Semantic \`kind: "${params.kind}"\` is not yet implemented. Supported kinds for \`mode: "semantic"\`: \`definition\`, \`export\`, \`import\`.`,
      details: undefined,
    };
  }

  const providerState = getCodeProvider(cwd);

  if (providerState.kind === "ready") {
    const symbols = await providerState.provider.workspaceSymbols(query);

    if (symbols && symbols.length > 0) {
      return renderSemanticResults(query, symbols, params, cwd);
    }
  }

  // Fall back to text search when no LSP or no symbols found
  const fallbackResult = await executeTextMode(query, params, scopePath, cwd);
  const note =
    "\n\n_Semantic search unavailable or returned no results — fell back to text search._";
  return {
    content: fallbackResult.content + note,
    details: fallbackResult.details,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function resolveScope(scope: string | undefined, cwd: string): string | null {
  if (!scope) return null;
  const resolved = normalizePath(scope, cwd);
  if (!existsSync(resolved)) return null;
  return resolved;
}

function getEffectiveProvider(cwd: string) {
  const state = getCodeProvider(cwd);
  return state.kind === "ready" ? state.provider : null;
}

/** Advisory note for text/regex mode when kind is set — no filtering is applied. */
function maybeAppendKindNote(result: CodeIntelResult, params: CodeFindToolParams): CodeIntelResult {
  if (!params.kind) return result;

  const note = `\n\n_Kind (\`${params.kind}\`) is advisory-only in text/regex mode — results are unfiltered text matches. Use \`mode: "ast"\` with \`kind\` for precise structural filtering, or \`mode: "semantic"\` for LSP symbol results._`;
  return {
    content: result.content + note,
    details: result.details,
  };
}

/** Render semantic (LSP workspace symbol) results. */
function renderSemanticResults(
  query: string,
  symbols: Array<{
    name: string;
    kind: string;
    file: string;
    line: number;
    character: number;
    container?: string | null;
  }>,
  params: CodeFindToolParams,
  cwd: string,
): CodeIntelResult {
  const max = params.maxResults ?? 8;
  const shown = symbols.slice(0, max);
  const omitted = symbols.length - shown.length;

  const lines = [
    `**Semantic search** — \`${query}\` (${symbols.length} symbol${symbols.length !== 1 ? "s" : ""} found)`,
  ];

  for (const sym of shown) {
    const kindLabel = sym.kind ? ` [${sym.kind}]` : "";
    const container = sym.container ? ` (in ${sym.container})` : "";
    const fileRel = sym.file.startsWith(cwd) ? sym.file.slice(cwd.length + 1) : sym.file;
    lines.push(`- \`${sym.name}\`${kindLabel}${container} — \`${fileRel}:${sym.line}\``);
  }

  if (omitted > 0) {
    lines.push(`  _+${omitted} more omitted — narrow \`query\` or increase \`maxResults\`_`);
  }

  const nextQueries = [
    'Use `mode: "text"` for literal text search',
    'Use `mode: "ast"` with `kind` for structural filtering',
  ];

  return {
    content: lines.join("\n"),
    details: {
      type: "search",
      data: {
        confidence: "semantic",
        scope: params.scope ?? null,
        candidateCount: symbols.length,
        omittedCount: omitted,
        nextQueries,
      } satisfies SearchDetails,
    },
  };
}
