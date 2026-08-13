import {
  type CodeRequestControl,
  getDefaultWorkspaceRuntime,
} from "@mrclrchtr/supi-code-runtime/api";
import {
  getWorkspaceLspRuntime,
  type SemanticReadinessResult,
  type WorkspaceLspRuntimeState,
  waitForWorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";

export const DEFAULT_SEMANTIC_STARTUP_TIMEOUT_MS = 15_000;

export type SemanticStartupScope = { kind: "workspace" } | { kind: "file"; file: string };

export async function ensureSemanticReadiness(
  cwd: string,
  scope: SemanticStartupScope,
  timeoutMs: number = DEFAULT_SEMANTIC_STARTUP_TIMEOUT_MS,
  control?: CodeRequestControl,
): Promise<SemanticReadinessResult> {
  const workspace = getDefaultWorkspaceRuntime().getWorkspace(cwd);
  if (workspace.semantic.provider === null) {
    return {
      kind: "unavailable",
      reason: "No semantic/LSP provider is active for this workspace.",
    };
  }

  if (workspace.semantic.state.kind === "ready") {
    return resolveReadySemanticState(cwd, scope, timeoutMs, control);
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
  if (scope.kind === "workspace") {
    return control
      ? lspState.runtime.waitUntilReadyForWorkspace({ timeoutMs: remainingAfterLsp }, control)
      : lspState.runtime.waitUntilReadyForWorkspace({ timeoutMs: remainingAfterLsp });
  }
  return control
    ? lspState.runtime.waitUntilReadyForFile(scope.file, { timeoutMs: remainingAfterLsp }, control)
    : lspState.runtime.waitUntilReadyForFile(scope.file, { timeoutMs: remainingAfterLsp });
}

function resolveReadySemanticState(
  cwd: string,
  scope: SemanticStartupScope,
  timeoutMs: number,
  control?: CodeRequestControl,
): Promise<SemanticReadinessResult> | SemanticReadinessResult {
  const lspState = getWorkspaceLspRuntime(cwd);
  if (lspState.kind === "ready") {
    if (scope.kind === "workspace") {
      return control
        ? lspState.runtime.waitUntilReadyForWorkspace({ timeoutMs }, control)
        : lspState.runtime.waitUntilReadyForWorkspace({ timeoutMs });
    }
    return control
      ? lspState.runtime.waitUntilReadyForFile(scope.file, { timeoutMs }, control)
      : lspState.runtime.waitUntilReadyForFile(scope.file, { timeoutMs });
  }
  return {
    kind: "unavailable",
    reason:
      lspState.kind === "unavailable"
        ? lspState.reason
        : `LSP service is ${lspState.kind} for this workspace.`,
  };
}

async function resolveSemanticServiceState(
  cwd: string,
  timeoutMs: number,
): Promise<WorkspaceLspRuntimeState> {
  const initialState = getWorkspaceLspRuntime(cwd);
  if (initialState.kind !== "pending") return initialState;
  return waitForWorkspaceLspRuntime(cwd, timeoutMs);
}
