/**
 * Tool executor for code_find.
 *
 * Unified ranked code search with strict mode dispatch:
 * - text (default): literal ripgrep
 * - regex: ripgrep regex
 * - ast: tree-sitter structured search (definition | import | export | call)
 * - semantic: LSP workspace symbols
 */

import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";
import { getCodeProvider } from "../analysis/context/request-context.ts";
import { resolveScope } from "../search-helpers.ts";
import type { CodeIntelResult, SearchDetails } from "../types.ts";
import { executePattern } from "../use-case/generate-pattern.ts";
import { unavailableSearchDetails } from "./details-helpers.ts";
import { ensureSemanticReadiness, renderSemanticReadinessTimeout } from "./semantic-readiness.ts";

export interface CodeFindToolParams {
  query: string;
  scope?: string;
  mode?: "text" | "regex" | "ast" | "semantic";
  kind?: "definition" | "import" | "export" | "call" | "type" | "interface" | "test";
  contextLines?: number;
  maxResults?: number;
}

const SUPPORTED_AST_KIND_LABELS = [
  "definition",
  "import",
  "export",
  "call",
  "type",
  "interface",
] as const;

const SUPPORTED_AST_KINDS = new Set<NonNullable<CodeFindToolParams["kind"]>>(
  SUPPORTED_AST_KIND_LABELS,
);

const SUPPORTED_AST_KIND_TEXT = SUPPORTED_AST_KIND_LABELS.map((kind) => `\`${kind}\``).join(", ");

export async function executeFindTool(
  params: CodeFindToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const cwd = ctx.cwd;

  if (!params.query || params.query.trim().length === 0) {
    return {
      content: "**Error:** `code_find` requires a non-empty `query` parameter.",
      details: unavailableSearchDetails(params.scope ?? null, [
        "Provide a non-empty `query` parameter",
      ]),
    };
  }

  const scopeResolution = resolveScope(params.scope, cwd);
  if (scopeResolution.kind === "error") {
    return {
      content: `**Error:** ${scopeResolution.reason}`,
      details: unavailableSearchDetails(params.scope ?? null, [
        "Verify the `scope` path exists and is within the workspace",
      ]),
    };
  }
  const scopePath = scopeResolution.path;

  const mode = params.mode ?? "text";
  validateModeKindCombination(params, mode);

  switch (mode) {
    case "text":
      return executeTextMode(params.query, params, scopePath, cwd);
    case "regex":
      return executeRegexMode(params.query, params, scopePath, cwd);
    case "ast":
      return executeAstMode(params.query, params, scopePath, cwd);
    case "semantic":
      return executeSemanticMode(params.query, params, scopePath, cwd);
  }
}

async function executeTextMode(
  query: string,
  params: CodeFindToolParams,
  scopePath: string,
  cwd: string,
): Promise<CodeIntelResult> {
  return executePattern(
    {
      pattern: query,
      path: scopePath,
      regex: false,
      kind: undefined,
      maxResults: params.maxResults ?? 8,
      contextLines: params.contextLines ?? 1,
    },
    { cwd, provider: getEffectiveProvider(cwd) },
  );
}

async function executeRegexMode(
  query: string,
  params: CodeFindToolParams,
  scopePath: string,
  cwd: string,
): Promise<CodeIntelResult> {
  return executePattern(
    {
      pattern: query,
      path: scopePath,
      regex: true,
      kind: undefined,
      maxResults: params.maxResults ?? 8,
      contextLines: params.contextLines ?? 1,
    },
    { cwd, provider: getEffectiveProvider(cwd) },
  );
}

async function executeAstMode(
  query: string,
  params: CodeFindToolParams,
  scopePath: string,
  cwd: string,
): Promise<CodeIntelResult> {
  ensureStructuralAvailable(cwd);

  return executePattern(
    {
      pattern: query,
      path: scopePath,
      kind: params.kind,
      maxResults: params.maxResults ?? 8,
      contextLines: params.contextLines ?? 1,
    },
    { cwd, provider: getEffectiveProvider(cwd) },
  );
}

async function executeSemanticMode(
  query: string,
  params: CodeFindToolParams,
  scopePath: string,
  cwd: string,
): Promise<CodeIntelResult> {
  ensureSemanticAvailable(cwd);

  const readiness = await ensureSemanticReadiness(cwd, { kind: "workspace" });
  if (readiness.kind === "timeout") {
    return {
      content: renderSemanticReadinessTimeout("code_find", 15_000),
      details: unavailableSearchDetails(params.scope ?? null, [
        "Retry shortly or check `code_health`",
      ]),
    };
  }
  if (readiness.kind === "unavailable") {
    return {
      content: `**Error:** ${readiness.reason}`,
      details: unavailableSearchDetails(params.scope ?? null, [
        "Check `code_health` for provider status",
      ]),
    };
  }

  const providerState = getCodeProvider(cwd);
  if (providerState.kind !== "ready") {
    throw new Error(
      "code_find semantic search is unavailable because no semantic/LSP provider is active for this workspace.",
    );
  }

  const symbols = await providerState.provider.workspaceSymbols(query);
  if (symbols === null) {
    throw new Error(
      "code_find semantic search is unavailable because the active semantic provider cannot serve workspace symbol queries.",
    );
  }

  const scopedSymbols = filterSymbolsByScope(symbols, scopePath);
  if (scopedSymbols.length === 0) {
    return renderSemanticEmptyResult(query, params);
  }

  return renderSemanticResults(query, scopedSymbols, params, cwd);
}

function validateModeKindCombination(
  params: CodeFindToolParams,
  mode: NonNullable<CodeFindToolParams["mode"]>,
): void {
  if (!params.mode && params.kind) {
    throw new Error(
      `code_find does not accept \`kind\` when \`mode\` is omitted. Did you mean \`mode: "ast"\` with one of: ${SUPPORTED_AST_KIND_TEXT}?`,
    );
  }

  if ((mode === "text" || mode === "regex" || mode === "semantic") && params.kind) {
    throw new Error(
      `code_find does not accept \`kind\` with \`mode: "${mode}"\`. Use \`mode: "ast"\` with one of: ${SUPPORTED_AST_KIND_TEXT}.`,
    );
  }

  if (mode !== "ast") return;

  if (!params.kind) {
    throw new Error(
      `code_find with \`mode: "ast"\` requires \`kind\`. Supported AST kinds: ${SUPPORTED_AST_KIND_TEXT}.`,
    );
  }

  if (!SUPPORTED_AST_KINDS.has(params.kind)) {
    throw new Error(
      `code_find unsupported AST kind \`${params.kind}\`. Supported: ${SUPPORTED_AST_KIND_TEXT}.`,
    );
  }
}

function filterSymbolsByScope<T extends { file: string }>(symbols: T[], scopePath: string): T[] {
  return symbols.filter((symbol) => isWithinOrEqual(scopePath, symbol.file));
}

function getEffectiveProvider(cwd: string) {
  const state = getCodeProvider(cwd);
  return state.kind === "ready" ? state.provider : null;
}

function ensureSemanticAvailable(cwd: string): void {
  const workspace = getDefaultWorkspaceRuntime().getWorkspace(cwd);
  const available =
    (workspace.semantic.state.kind === "ready" || workspace.semantic.state.kind === "pending") &&
    workspace.semantic.provider !== null;
  if (!available) {
    throw new Error(
      "code_find semantic search is unavailable because no semantic/LSP provider is active for this workspace.",
    );
  }
}

function ensureStructuralAvailable(cwd: string): void {
  const workspace = getDefaultWorkspaceRuntime().getWorkspace(cwd);
  const available =
    workspace.structural.state.kind === "ready" && workspace.structural.provider !== null;
  if (!available) {
    throw new Error(
      "code_find AST search is unavailable because no structural/tree-sitter provider is active for this workspace.",
    );
  }
}

function renderSemanticEmptyResult(
  query: string,
  params: Pick<CodeFindToolParams, "scope">,
): CodeIntelResult {
  return {
    content: `**Semantic search** — \`${query}\`\n\nNo semantic results found in \`${params.scope ?? "."}\`.`,
    details: {
      type: "search",
      data: {
        confidence: "semantic",
        scope: params.scope ?? null,
        candidateCount: 0,
        omittedCount: 0,
        nextQueries: [
          'Use `mode: "text"` for literal text search',
          'Use `mode: "ast"` with `kind` for structural filtering',
        ],
      } satisfies SearchDetails,
    },
  };
}

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

  return {
    content: lines.join("\n"),
    details: {
      type: "search",
      data: {
        confidence: "semantic",
        scope: params.scope ?? null,
        candidateCount: symbols.length,
        omittedCount: omitted,
        nextQueries: [
          'Use `mode: "text"` for literal text search',
          'Use `mode: "ast"` with `kind` for structural filtering',
        ],
      } satisfies SearchDetails,
    },
  };
}
