/**
 * Tool executor for code_references.
 *
 * Resolves the target and collects semantic reference information.
 */

import { getCodeProvider } from "../analysis/context/request-context.ts";
import { collectReferences } from "../analysis/references/service.ts";
import { routeFor } from "../analysis/routing/planner.ts";
import { renderReferencesResult } from "../presentation/markdown/references.ts";
import type { CodeIntelResult } from "../types.ts";
import { validateFocusedToolParams } from "./validation.ts";

export interface CodeReferencesToolParams {
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  path?: string;
  maxResults?: number;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrator with multi-branch resolution logic
export async function executeReferencesTool(
  params: CodeReferencesToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const error = validateFocusedToolParams(params, ctx.cwd);
  if (error) {
    return { content: error, details: undefined };
  }

  if (!params.file && !params.symbol) {
    return {
      content:
        "**Error:** References require either anchored coordinates (`file`, `line`, `character`) or a `symbol`.",
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable" as const,
          scope: params.path ?? null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Provide `file`, `line`, `character` or a `symbol`"],
        },
      },
    };
  }

  const route = routeFor(ctx.cwd, "code_references");
  if (route.preferred === "unavailable") {
    return {
      content:
        "**Error:** No semantic analysis provider is available. Use lsp_* tools directly if needed.",
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable" as const,
          scope: null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Enable LSP for semantic reference resolution"],
        },
      },
    };
  }

  const providerState = getCodeProvider(ctx.cwd);
  const provider = providerState.kind === "ready" ? providerState.provider : null;

  // Resolve target and collect references
  const { resolveTarget } = await import("../analysis/targeting/resolve-target.ts");
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
    const result = await collectReferences(
      target.targets[0].file,
      target.targets[0].position,
      target.displayName ?? null,
      {
        cwd: ctx.cwd,
        provider: provider ? { references: provider.references } : null,
      },
    );
    return {
      content: renderReferencesResult(
        target.displayName,
        result.references,
        result.externalCount,
        result.confidence,
        ctx.cwd,
        params.maxResults ?? 8,
      ),
      details: {
        type: "search" as const,
        data: {
          confidence: result.confidence,
          scope: params.path ?? null,
          candidateCount: result.references.length,
          omittedCount: result.externalCount,
          nextQueries: [],
        },
      },
    };
  }

  const result = await collectReferences(target.file, target.position, target.name ?? null, {
    cwd: ctx.cwd,
    provider: provider ? { references: provider.references } : null,
  });
  const symbolName = target.name ?? `symbol at ${target.file}:${target.displayLine}`;
  const content = renderReferencesResult(
    symbolName,
    result.references,
    result.externalCount,
    result.confidence,
    ctx.cwd,
    params.maxResults ?? 8,
  );

  return {
    content,
    details: {
      type: "search" as const,
      data: {
        confidence: result.confidence,
        scope: params.path ?? null,
        candidateCount: result.references.length,
        omittedCount: result.externalCount,
        nextQueries: ["`code_affected` for impact analysis"],
      },
    },
  };
}
