import { getCodeProvider } from "../analysis/context/request-context.ts";
import { routeFor } from "../analysis/routing/planner.ts";
import { buildArchitectureModel } from "../model.ts";
import type { CodeIntelResult } from "../types.ts";
import { executeBrief } from "../use-case/generate-brief.ts";
import type { BriefInput } from "../use-case/types.ts";
import { lookupTargetId } from "./target-id-params.ts";
import { validateFocusedToolParams } from "./validation.ts";

export interface CodeBriefToolParams {
  targetId?: string;
  path?: string;
  file?: string;
  symbol?: string;
  maxResults?: number;
}

/** Execute the internal code_brief orientation substrate (used by code_context's orientation fallback). */
export async function executeBriefTool(
  params: CodeBriefToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  // Resolve targetId for orientation-only follow-up. Unlike graph/impact/refactor,
  // brief does not expand the handle back into anchored inspection coordinates.
  const targetLookup = lookupTargetId(params, ctx.cwd);
  if (targetLookup.kind === "error") {
    return { content: targetLookup.message, details: undefined };
  }
  if (targetLookup.kind === "ok") {
    params.file = targetLookup.entry.file;
    params.symbol = undefined;
    params.path = undefined;
  }

  const error = validateFocusedToolParams(params, ctx.cwd);
  if (error) {
    return { content: error, details: undefined };
  }

  const route = routeFor(ctx.cwd, "code_brief");
  const providerState = getCodeProvider(ctx.cwd);
  let provider = providerState.kind === "ready" ? providerState.provider : null;

  if (route.preferred === "unavailable") {
    // code_brief can still work with model-only data even without providers
    provider = null;
  }
  const model = await buildArchitectureModel(ctx.cwd);

  const input: BriefInput = determineInput(params);
  const deps = { model, provider, cwd: ctx.cwd };

  const result = await executeBrief(input, deps);
  return { content: result.content, details: { type: "brief", data: result.details } };
}

function determineInput(params: CodeBriefToolParams): BriefInput {
  if (params.symbol) {
    return {
      kind: "symbol",
      symbol: params.symbol,
      path: params.path,
      maxResults: params.maxResults,
    };
  }
  if (params.path) {
    return { kind: "path", path: params.path, maxResults: params.maxResults };
  }
  if (params.file) {
    return { kind: "file", file: params.file, maxResults: params.maxResults };
  }
  return { kind: "project", maxResults: params.maxResults };
}
