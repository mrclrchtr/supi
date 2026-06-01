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
import { collectCallSitesInFile } from "../analysis/relations/call-sites.ts";
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

/** All valid structured pattern kind values (subset not yet implemented in AST mode). */
const STRUCTURED_KINDS = new Set(["definition", "export", "import", "call", "type", "test"]);

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
  // Check for unsupported kind values
  if (params.kind && !STRUCTURED_KINDS.has(params.kind)) {
    return {
      content: `**Error:** Unknown \`kind: "${params.kind}"\`. Valid kinds for \`mode: "ast"\`: \`definition\`, \`export\`, \`import\`, \`call\`. \`type\` and \`test\` are not yet available.`,
      details: undefined,
    };
  }

  // type/test are not yet implemented for AST mode
  if (params.kind === "type" || params.kind === "test") {
    return {
      content: `**Not yet implemented:** AST \`kind: "${params.kind}"\` is not yet available. Supported AST kinds: \`definition\`, \`export\`, \`import\`, \`call\`. Use \`mode: "text"\` or \`mode: "semantic"\` as alternatives.`,
      details: undefined,
    };
  }

  // call uses ripgrep + heuristic filtering — no tree-sitter needed
  if (params.kind === "call") {
    return executeCallSiteSearch(query, params, cwd);
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

/**
 * Call-site search using shared regex-based matching.
 * Does not require tree-sitter — walks files and matches identifiers
 * followed by `(` using the shared `collectCallSitesInFile` helper.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: call-site search naturally spans file collection, matching, and result rendering
async function executeCallSiteSearch(
  query: string,
  params: CodeFindToolParams,
  cwd: string,
): Promise<CodeIntelResult> {
  const { statSync, readdirSync } = await import("node:fs");
  const path = await import("node:path");

  const scopePath = resolveScope(params.scope, cwd) ?? cwd;
  const maxResults = params.maxResults ?? 8;

  const sourceFiles = collectSourceFiles(scopePath, statSync, readdirSync, path);
  const matches: Array<{ file: string; name: string; line: number }> = [];

  for (const absPath of sourceFiles) {
    if (matches.length >= maxResults) break;
    const callSites = collectCallSitesInFile(absPath, (word) => word === query);
    const relFile = path.relative(cwd, absPath);
    for (const cs of callSites) {
      if (matches.length >= maxResults) break;
      matches.push({ file: relFile, name: cs.name, line: cs.line });
    }
  }

  if (matches.length === 0) {
    return {
      content: `**Call-site search** — \`${query}\`\n\nNo call sites found in \`${params.scope ?? "."}\`.`,
      details: {
        type: "search",
        data: {
          confidence: "structural",
          scope: params.scope ?? null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: [
            'Use `mode: "text"` for all occurrences, including declarations and imports.',
          ],
        } satisfies SearchDetails,
      },
    };
  }

  const lines = [
    `**Call-site search** — \`${query}\` (${matches.length} call site${matches.length !== 1 ? "s" : ""} found)`,
  ];
  for (const m of matches) {
    lines.push(`- \`${m.file}\`:${m.line} — \`${m.name}()\``);
  }

  return {
    content: lines.join("\n"),
    details: {
      type: "search",
      data: {
        confidence: "structural",
        scope: params.scope ?? null,
        candidateCount: matches.length,
        omittedCount: 0,
        nextQueries: ["Use `code_context` with the file for deeper context."],
      } satisfies SearchDetails,
    },
  };
}

/** Collect source files from a directory (recursive, with skip-dirs). */
function collectSourceFiles(
  scopePath: string,
  statSync: typeof import("node:fs").statSync,
  readdirSync: typeof import("node:fs").readdirSync,
  path: typeof import("node:path"),
): string[] {
  const files: string[] = [];
  const skipDirs = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
  const MAX_FILES = 200;
  const SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: file-walk naturally spans stat/dir/recursion branches
  function walk(currentPath: string) {
    if (files.length >= MAX_FILES) return;
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(currentPath);
    } catch {
      return;
    }
    if (stat.isFile()) {
      if (SOURCE_EXTS.includes(path.extname(currentPath))) {
        files.push(currentPath);
      }
      return;
    }
    let entries: Array<{ name: string; isDirectory: () => boolean }>;
    try {
      entries = readdirSync(currentPath, { withFileTypes: true }) as Array<{
        name: string;
        isDirectory: () => boolean;
      }>;
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
      walk(path.join(currentPath, entry.name));
    }
  }

  walk(scopePath);
  return files;
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
