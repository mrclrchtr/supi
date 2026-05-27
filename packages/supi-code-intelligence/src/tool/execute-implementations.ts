/**
 * Tool executor for code_implementations.
 *
 * Resolves a target and finds semantic implementations.
 */

import { collectServiceImplementations } from "../analysis/implementations/service.ts";
import { routeFor } from "../planner/planner.ts";
import { renderImplementationsResult } from "../presentation/markdown/implementations.ts";
import type { CodeIntelResult } from "../types.ts";
import { getCodeProvider } from "../workspace/request-context.ts";
import { validateFocusedToolParams } from "./validation.ts";

export interface CodeImplementationsToolParams {
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  path?: string;
  maxResults?: number;
}

export async function executeImplementationsTool(
  params: CodeImplementationsToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const error = validateFocusedToolParams(params, ctx.cwd);
  if (error) {
    return { content: error, details: undefined };
  }

  if (!params.file && !params.symbol) {
    return {
      content: "**Error:** Implementations require either anchored coordinates or a `symbol`.",
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable" as const,
          scope: null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Provide `file`, `line`, `character` or a `symbol`"],
        },
      },
    };
  }

  const route = routeFor(ctx.cwd, "code_implementations");
  if (route.preferred === "unavailable") {
    return {
      content: "**Error:** No semantic analysis provider is available. Use lsp_* tools directly.",
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable" as const,
          scope: null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Enable LSP for semantic implementation lookup"],
        },
      },
    };
  }

  const providerState = getCodeProvider(ctx.cwd);
  const provider = providerState.kind === "ready" ? providerState.provider : null;

  const { resolveTarget } = await import("../resolve-target.ts");
  const target = await resolveTarget(params, ctx.cwd, provider ?? undefined);
  if (typeof target === "string") {
    return {
      content: target,
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

  if ("targets" in target) {
    return {
      content:
        "**Error:** File-level implementation discovery is not available. Provide `line` and `character` for a precise target.",
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

  const result = await collectServiceImplementations(
    target.file,
    target.position,
    target.name ?? null,
    {
      cwd: ctx.cwd,
      provider: provider ? { implementation: provider.implementation } : null,
    },
  );

  const symbolName = target.name ?? `symbol at ${target.file}:${target.displayLine}`;
  const content = renderImplementationsResult(
    result.implementations,
    result.externalCount,
    ctx.cwd,
    params.maxResults ?? 8,
    symbolName,
  );

  return {
    content,
    details: {
      type: "search" as const,
      data: {
        confidence: result.confidence,
        scope: params.path ?? null,
        candidateCount: result.implementations.length,
        omittedCount: result.externalCount,
        nextQueries: ["`code_brief` on implementing modules for deeper context"],
      },
    },
  };
}
