/**
 * Shared context dependency assembly for code_orientation.
 *
 * Used by both the precise-target and orientation-mode execution paths
 * to build the provider/model/LSP deps needed by the use-case layer.
 */

import type { CodeProvider } from "../../analysis/context/request-context.ts";
import { buildArchitectureModel } from "../../architecture/model.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types.ts";
import type { ContextDeps as UseCaseContextDeps } from "../../use-case/types.ts";
import { unavailableContextDetails } from "../details-helpers.ts";
import type { CodeOrientationToolParams } from "../execute-context.ts";
import { ensureSemanticReadiness, renderSemanticReadinessTimeout } from "../semantic-readiness.ts";

/** Shared context dependencies (provider/model/lsp) or a readiness error result. */
export type ContextDeps = Omit<UseCaseContextDeps, "cwd"> | CodeIntelResult;

/**
 * Assemble provider deps and architecture model for the use-case layer.
 *
 * If the semantic provider is not ready and a precise target is requested,
 * gates behind readiness (which may timeout). Returns a CodeIntelResult
 * on timeout or the assembled deps on success.
 */
export async function prepareContextDeps(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<ContextDeps> {
  const readinessResult = await gateSemanticReadiness(params, ctx.cwd);
  if (readinessResult) return readinessResult;

  const providerState = ctx.session.getProviders();
  const provider: CodeProvider | null =
    providerState.kind === "ready" ? providerState.provider : null;
  const lspService =
    providerState.kind === "ready"
      ? providerState.lspService
      : { kind: "unavailable" as const, reason: "No provider" };
  const model = await buildArchitectureModel(ctx.cwd);
  return { model, provider, lspService };
}

async function gateSemanticReadiness(
  params: CodeOrientationToolParams,
  cwd: string,
): Promise<CodeIntelResult | null> {
  const hasSemanticTarget = params.file != null && params.line != null && params.character != null;
  if (!hasSemanticTarget) return null;

  const readiness = await ensureSemanticReadiness(
    cwd,
    params.file ? { kind: "file", file: params.file } : { kind: "workspace" },
  );
  if (readiness.kind === "timeout") {
    return {
      content: renderSemanticReadinessTimeout("code_orientation", 15_000),
      details: unavailableContextDetails(["Retry shortly or check `code_health`"]),
    };
  }
  return null;
}
