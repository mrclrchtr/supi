/**
 * Shared context dependency assembly for code_orientation.
 *
 * Used by both the precise-target and orientation-mode execution paths
 * to build the provider/model/LSP deps needed by the use-case layer.
 */

import { buildArchitectureModel } from "../../analysis/architecture/discovery.ts";
import type { CodeProvider } from "../../analysis/provider.ts";
import { ensureSemanticReadiness } from "../../analysis/readiness.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import type { OrientationDeps as UseCaseOrientationDeps } from "../../ui/markdown/types.ts";
import { unavailableContextDetails } from "../infra/error-results.ts";
import { renderSemanticReadinessTimeout } from "../infra/readiness-message.ts";
import type { CodeOrientationToolParams } from "./execute.ts";

/** Shared context dependencies (provider/model/lsp) or a readiness error result. */
export type OrientationDeps = Omit<UseCaseOrientationDeps, "cwd"> | CodeIntelResult;

/**
 * Assemble provider deps and architecture model for the use-case layer.
 *
 * If the semantic provider is not ready and a precise target is requested,
 * gates behind readiness (which may timeout). Returns a CodeIntelResult
 * on timeout or the assembled deps on success.
 */
export async function prepareOrientationDeps(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<OrientationDeps> {
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
