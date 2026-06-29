/**
 * Tool executor for code_health.
 *
 * Thin executor: validates scope, extracts provider state from the
 * session, and delegates to the health use-case which handles data
 * collection, rendering, and details construction.
 */

import { resolveScope } from "../../analysis/search/ripgrep.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { unavailableHealthDetails } from "../infra/error-results.ts";
import { emitToolProgress } from "../infra/progress.ts";
import {
  executeHealth,
  getLastHealthRefresh,
  type HealthInput,
  trackHealthRefresh,
} from "./orchestrate.ts";

export interface CodeHealthToolParams {
  scope?: string;
  refresh?: boolean;
  include?: string[];
  level?: "summary" | "detailed";
  coveragePath?: string;
  unusedPath?: string;
}

export async function executeHealthTool(
  params: CodeHealthToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const cwd = ctx.cwd;
  emitToolProgress(ctx.onUpdate, "code_health: gathering workspace health...");

  const scopeResolution = resolveScope(params.scope, cwd);
  if (scopeResolution.kind === "error") {
    return {
      content: `**Error:** ${scopeResolution.reason}`,
      details: unavailableHealthDetails("scope not found"),
    };
  }
  const scopeFilter = scopeResolution.path === cwd ? null : scopeResolution.path;

  if (params.refresh) {
    trackHealthRefresh(cwd);
  }

  const providerState = ctx.session.getProviders();
  const workspaceState = ctx.session.getWorkspaceState();
  const lspState =
    providerState.kind === "ready"
      ? providerState.lspService
      : { kind: "unavailable" as const, reason: "No provider" };

  const input: HealthInput = {
    scope: params.scope,
    refresh: params.refresh,
    include: params.include,
    level: params.level,
    coveragePath: params.coveragePath,
    unusedPath: params.unusedPath,
  };

  return executeHealth(input, {
    cwd,
    lspState,
    providerAvailable: providerState.kind === "ready",
    semanticStateKind: workspaceState.semantic.state.kind,
    structuralState: workspaceState.structural.state,
    lspController: ctx.session.lspController,
    onUpdate: ctx.onUpdate,
    scopeFilter,
    lastRefresh: getLastHealthRefresh(cwd),
  });
}
