import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import {
  getSessionLspService,
  type SemanticReadinessResult,
  type SessionLspServiceState,
  waitForSessionLspService,
} from "@mrclrchtr/supi-lsp/api";

export const DEFAULT_SEMANTIC_STARTUP_TIMEOUT_MS = 15_000;

export type SemanticStartupScope = { kind: "workspace" } | { kind: "file"; file: string };

export async function ensureSemanticReadiness(
  cwd: string,
  scope: SemanticStartupScope,
  timeoutMs: number = DEFAULT_SEMANTIC_STARTUP_TIMEOUT_MS,
): Promise<SemanticReadinessResult> {
  const workspace = getDefaultWorkspaceRuntime().getWorkspace(cwd);
  if (workspace.semantic.provider === null) {
    return {
      kind: "unavailable",
      reason: "No semantic/LSP provider is active for this workspace.",
    };
  }

  if (workspace.semantic.state.kind === "ready") {
    return { kind: "ready" };
  }

  if (workspace.semantic.state.kind !== "pending") {
    return {
      kind: "unavailable",
      reason: `Semantic provider is ${workspace.semantic.state.kind} for this workspace.`,
    };
  }

  const deadline = Date.now() + timeoutMs;

  const remainingAfterService = deadline - Date.now();
  if (remainingAfterService <= 0) {
    return { kind: "timeout" };
  }
  const lspState = await resolveSemanticServiceState(cwd, remainingAfterService);
  if (lspState.kind === "pending") {
    return { kind: "timeout" };
  }
  if (lspState.kind !== "ready") {
    return {
      kind: "unavailable",
      reason:
        lspState.kind === "unavailable"
          ? lspState.reason
          : `LSP service is ${lspState.kind} for this workspace.`,
    };
  }

  const remainingAfterLsp = deadline - Date.now();
  if (remainingAfterLsp <= 0) {
    return { kind: "timeout" };
  }
  return scope.kind === "workspace"
    ? lspState.service.waitUntilReadyForWorkspace({ timeoutMs: remainingAfterLsp })
    : lspState.service.waitUntilReadyForFile(scope.file, { timeoutMs: remainingAfterLsp });
}

export function renderSemanticReadinessTimeout(toolName: string, timeoutMs: number): string {
  const seconds = Math.max(1, Math.round(timeoutMs / 1000));
  return `**Error:** Semantic analysis for \`${toolName}\` is still warming for this workspace (LSP indexing/startup not finished after ${seconds}s). Try again shortly or check \`code_health\`.`;
}

async function resolveSemanticServiceState(
  cwd: string,
  timeoutMs: number,
): Promise<SessionLspServiceState> {
  const initialState = getSessionLspService(cwd);
  if (initialState.kind !== "pending") return initialState;
  return waitForSessionLspService(cwd, timeoutMs);
}
