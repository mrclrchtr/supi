/**
 * Tool executor for code_find.
 *
 * Unified ranked code search with strict mode dispatch:
 * - text (default): literal ripgrep
 * - regex: ripgrep regex
 * - ast: tree-sitter structured search
 * - semantic: LSP workspace symbols
 *
 * Thin executor: validates params via pipeline, then delegates all
 * modes to the pattern use-case.
 */

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { findModeKindRules } from "../infra/cross-field.ts";
import { unavailableSearchDetails } from "../infra/error-results.ts";
import {
  gateSemanticReadiness,
  resolveScopeParam,
  runPipe,
  validateParams,
} from "../infra/pipeline.ts";
import { emitToolProgress } from "../infra/progress.ts";
import { renderSemanticReadinessTimeout } from "../infra/readiness-message.ts";
import { executePattern } from "./orchestrate.ts";

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

      // AST mode requires structural provider
      if (mode === "ast" && !c.session.getStructuralProvider()) {
        throw new Error(
          "code_find AST search is unavailable because no structural/tree-sitter provider is active for this workspace.",
        );
      }

      return executePattern(
        {
          pattern: p.query,
          path: p.scope ?? c.cwd,
          regex: mode === "regex",
          kind: p.kind,
          mode,
          maxResults: p.maxResults ?? 8,
          contextLines: p.contextLines ?? 1,
        },
        { cwd: c.cwd, provider: c.session.getProvider(), signal: c.signal },
      );
    },
  );
}
