/**
 * Tool executor for code_calls.
 *
 * Requires file + line + character. Reports structural outgoing calls.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { collectOutgoingCalls } from "../analysis/calls/service.ts";
import { getCodeProvider } from "../analysis/context/request-context.ts";
import { routeFor } from "../analysis/routing/planner.ts";
import { renderCallsResult } from "../presentation/markdown/calls.ts";
import { normalizePath } from "../search-helpers.ts";
import type { CodeIntelResult } from "../types.ts";

export interface CodeCallsToolParams {
  file: string;
  line: number;
  character: number;
  maxResults?: number;
}

export async function executeCallsTool(
  params: CodeCallsToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  if (!params.file) {
    return { content: "**Error:** `file` is required for code_calls.", details: undefined };
  }

  const resolvedFile = normalizePath(params.file, ctx.cwd);
  if (!fs.existsSync(resolvedFile)) {
    return { content: `**Error:** File not found: \`${params.file}\``, details: undefined };
  }

  if (!Number.isInteger(params.line) || params.line < 1) {
    return { content: "**Error:** `line` must be a positive 1-based integer.", details: undefined };
  }
  if (!Number.isInteger(params.character) || params.character < 1) {
    return {
      content: "**Error:** `character` must be a positive 1-based integer.",
      details: undefined,
    };
  }

  const route = routeFor(ctx.cwd, "code_calls");
  if (route.preferred === "unavailable") {
    return {
      content:
        "**Error:** No structural analysis provider is available. Use tree_sitter_* tools directly if needed.",
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable" as const,
          scope: null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: [],
        },
      },
    };
  }

  const providerState = getCodeProvider(ctx.cwd);
  const provider = providerState.kind === "ready" ? providerState.provider : null;
  const relPath = path.relative(ctx.cwd, resolvedFile);

  const result = await collectOutgoingCalls(relPath, params.line, params.character, null, {
    cwd: ctx.cwd,
    provider: provider ? { calleesAt: provider.calleesAt } : null,
  });

  const content = renderCallsResult(
    result.targetName,
    result.calls,
    relPath,
    params.maxResults ?? 8,
  );

  return {
    content,
    details: {
      type: "search" as const,
      data: {
        confidence: result.confidence,
        scope: null,
        candidateCount: result.calls.length,
        omittedCount: 0,
        nextQueries: ["Use `lsp_hover` for type info on individual callees"],
      },
    },
  };
}
