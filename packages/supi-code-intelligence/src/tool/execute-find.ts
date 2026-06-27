/**
 * Tool executor for code_find.
 *
 * Unified ranked code search with strict mode dispatch:
 * - text (default): literal ripgrep
 * - regex: ripgrep regex
 * - ast: tree-sitter structured search
 * - semantic: LSP workspace symbols
 */

import type { CodeSymbol } from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";
import { createEvidenceList, renderEvidenceListDisclosure } from "../presentation/evidence-list.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx, SearchDetails } from "../types.ts";
import { executePattern } from "../use-case/generate-pattern.ts";
import { unavailableSearchDetails } from "./details-helpers.ts";
import { findModeKindRules } from "./cross-field.ts";
import { gateSemanticReadiness, resolveScopeParam, runPipe, validateParams } from "./pipeline.ts";
import { emitToolProgress } from "./progress.ts";
import { renderSemanticReadinessTimeout } from "./semantic-readiness.ts";

export interface CodeFindToolParams {
  query: string;
  scope?: string;
  mode?: "text" | "regex" | "ast" | "semantic";
  kind?:
    | "definition"
    | "import"
    | "export"
    | "call"
    | "type"
    | "interface"
    | "class"
    | "method"
    | "enum"
    | "test";
  contextLines?: number;
  maxResults?: number;
}

export async function executeFindTool(
  params: CodeFindToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  if (!params.query || params.query.trim().length === 0) {
    return {
      content: "**Error:** `code_find` requires a non-empty `query` parameter.",
      details: unavailableSearchDetails(params.scope ?? null, [
        "Provide a non-empty `query` parameter",
      ]),
    };
  }

  emitToolProgress(ctx.onUpdate, `code_find: searching for "${params.query}"...`);

  const mode = params.mode ?? "text";
  const needsSemanticReadiness = mode === "semantic";

  return runPipe(
    params,
    ctx,
    [
      validateParams(findModeKindRules(), (msg) => ({
        content: msg,
        details: unavailableSearchDetails(params.scope ?? null, [
          'Use `mode: "ast"` with `kind`, or remove `kind` for text/regex/semantic search',
        ]),
      })),
      resolveScopeParam((reason) => ({
        content: `**Error:** ${reason}`,
        details: unavailableSearchDetails(params.scope ?? null, [
          "Verify the `scope` path exists and is within the workspace",
        ]),
      })),
      ...(needsSemanticReadiness
        ? [
            gateSemanticReadiness("code_find", {
              onTimeout: () => ({
                content: renderSemanticReadinessTimeout("code_find", 15_000),
                details: unavailableSearchDetails(params.scope ?? null, [
                  "Retry shortly or check `code_health`",
                ]),
              }),
              throwOnUnavailable: true,
            }),
          ]
        : []),
    ],
    async (p, c) => {
      emitToolProgress(c.onUpdate, `code_find: ${mode} mode...`);

      switch (mode) {
        case "text":
          return executeTextMode(p.query, p, c);
        case "regex":
          return executeRegexMode(p.query, p, c);
        case "ast":
          return executeAstMode(p.query, p, c);
        case "semantic":
          return executeSemanticMode(p.query, p, c);
        default:
          return {
            content: `**Error:** Unsupported mode: ${mode}`,
            details: unavailableSearchDetails(p.scope ?? null, [
              "Use text, regex, ast, or semantic",
            ]),
          };
      }
    },
  );
}

async function executeTextMode(
  query: string,
  params: CodeFindToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  return executePattern(
    {
      pattern: query,
      path: params.scope ?? ctx.cwd,
      regex: false,
      kind: undefined,
      maxResults: params.maxResults ?? 8,
      contextLines: params.contextLines ?? 1,
    },
    { cwd: ctx.cwd, provider: ctx.session.getProvider(), signal: ctx.signal },
  );
}

async function executeRegexMode(
  query: string,
  params: CodeFindToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  return executePattern(
    {
      pattern: query,
      path: params.scope ?? ctx.cwd,
      regex: true,
      kind: undefined,
      maxResults: params.maxResults ?? 8,
      contextLines: params.contextLines ?? 1,
    },
    { cwd: ctx.cwd, provider: ctx.session.getProvider(), signal: ctx.signal },
  );
}

async function executeAstMode(
  query: string,
  params: CodeFindToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  if (!ctx.session.getStructuralProvider()) {
    throw new Error(
      "code_find AST search is unavailable because no structural/tree-sitter provider is active for this workspace.",
    );
  }

  return executePattern(
    {
      pattern: query,
      path: params.scope ?? ctx.cwd,
      kind: params.kind,
      maxResults: params.maxResults ?? 8,
      contextLines: params.contextLines ?? 1,
    },
    { cwd: ctx.cwd, provider: ctx.session.getProvider(), signal: ctx.signal },
  );
}

async function executeSemanticMode(
  query: string,
  params: CodeFindToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  if (!ctx.session.getSemanticProvider()) {
    throw new Error(
      "code_find semantic search is unavailable because no semantic/LSP provider is active for this workspace.",
    );
  }

  const providerState = ctx.session.getProviders();
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

  const scopePath = params.scope ?? ctx.cwd;
  const scopedSymbols = filterSymbolsByScope(symbols, scopePath);
  if (scopedSymbols.length === 0) {
    return renderSemanticEmptyResult(query, params);
  }

  return renderSemanticResults(query, scopedSymbols, params, ctx.cwd);
}

function filterSymbolsByScope<T extends { file: string }>(symbols: T[], scopePath: string): T[] {
  return symbols.filter((symbol) => isWithinOrEqual(scopePath, symbol.file));
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
  symbols: CodeSymbol[],
  params: CodeFindToolParams,
  cwd: string,
): CodeIntelResult {
  const max = params.maxResults ?? 8;
  const evidence = createEvidenceList({
    key: "find.semanticSymbols",
    items: symbols,
    maxResults: max,
  });

  const lines = [
    `**Semantic search** — \`${query}\` (${symbols.length} symbol${symbols.length !== 1 ? "s" : ""} found)`,
  ];

  for (const sym of evidence.items) {
    const kindLabel = sym.kind ? ` [${sym.kind}]` : "";
    const container = sym.container ? ` (in ${sym.container})` : "";
    const fileRel = sym.file.startsWith(cwd) ? sym.file.slice(cwd.length + 1) : sym.file;
    const anchor = sym.nameAnchor ?? sym.declarationAnchor;
    lines.push(`- \`${sym.name}\`${kindLabel}${container} — \`${fileRel}:${anchor.line}\``);
  }

  const disclosure = renderEvidenceListDisclosure(evidence);
  if (disclosure) {
    lines.push(disclosure);
  }

  return {
    content: lines.join("\n"),
    details: {
      type: "search",
      data: {
        confidence: "semantic",
        scope: params.scope ?? null,
        candidateCount: symbols.length,
        omittedCount: evidence.metadata.omittedCount ?? 0,
        evidenceLists: [evidence.metadata],
        nextQueries: [
          'Use `mode: "text"` for literal text search',
          'Use `mode: "ast"` with `kind` for structural filtering',
        ],
      } satisfies SearchDetails,
    },
  };
}
