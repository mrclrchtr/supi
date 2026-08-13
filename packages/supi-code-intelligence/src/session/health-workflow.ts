/** Session-owned workspace health workflow. */

import type { CapabilityState } from "@mrclrchtr/supi-code-runtime/api";
import type {
  LspRuntimeController,
  WorkspaceLspRuntime,
  WorkspaceLspRuntimeState,
} from "@mrclrchtr/supi-lsp/api";
import {
  evaluateCapabilityWarnings,
  gatherCapabilityWarningInput,
} from "../analysis/capability/capability-warnings.ts";
import {
  collectDiagnostics,
  diagnosticScope,
  isScopedFile,
} from "../analysis/health/diagnostics.ts";
import { describeStructuralState, recoverDiagnosticRuntime } from "../analysis/health/recovery.ts";
import { collectServers } from "../analysis/health/signals.ts";
import { resolveScope } from "../analysis/search/paths.ts";
import { refreshFileLspMaintenance, refreshLspMaintenance } from "../substrate/lsp/maintenance.ts";
import type { CapabilityAdapter } from "./capability-adapter.ts";
import type {
  HealthData,
  HealthDiagnosticScope,
  HealthRefreshAttempt,
  HealthRefreshState,
  HealthSection,
  HealthWorkflowInput,
  HealthWorkflowOutcome,
  SemanticHealthState,
} from "./health-types.ts";
import type { InputValidation } from "./input/common.ts";
import { parseHealthWorkflowInput } from "./input/health-refactor.ts";
import { reportProgress, throwIfAborted, type WorkflowControl } from "./workflow-control.ts";

const DEFAULT_INCLUDE: readonly HealthSection[] = ["diagnostics", "servers"];

export interface HealthWorkflowDeps {
  readonly cwd: string;
  readonly capability: CapabilityAdapter;
  readonly lspController: LspRuntimeController | null;
  readonly lastRefreshAttempt: HealthRefreshAttempt | null;
  readonly trackRefreshAttempt: (attempt: HealthRefreshAttempt) => void;
  /** Workspace sentinel snapshot for change detection. */
  readonly sentinelSnapshot: Map<string, number>;
}

/** Collect health facts without rendering a public result. */
export async function runHealthWorkflow(
  input: HealthWorkflowInput,
  deps: HealthWorkflowDeps,
  control?: WorkflowControl,
): Promise<HealthWorkflowOutcome> {
  const prepared = prepareHealthRequest(input, deps.cwd);
  if (prepared.kind === "invalid-input") return prepared;
  const { request, scopeFilter, included, level } = prepared.value;
  const semanticRequested = healthNeedsSemantic(included);
  throwIfAborted(control);

  reportProgress(control, {
    intent: "health",
    phase: "collection",
    message: "Collecting workspace health evidence",
  });

  const lspState = deps.capability.getLspRuntimeState(deps.cwd);
  const capabilityStates = deps.capability.getCapabilityStates(deps.cwd);
  const runtime = lspState.kind === "ready" ? lspState.runtime : null;
  const serverInventoryAvailable = lspState.kind === "ready" || lspState.kind === "disabled";

  const diagnosticsScope = diagnosticScope(scopeFilter);
  const refresh = await collectRefreshState({
    refreshRequested: request.refresh === true,
    diagnosticsRequested: included.includes("diagnostics"),
    runtime,
    lspState,
    diagnosticsScope,
    deps,
    control,
  });
  const semanticState = await establishSemanticHealthState({
    requested: semanticRequested,
    runtime,
    scopeFilter,
    lspState,
    capabilityState: capabilityStates.semantic,
    control,
  });
  const semanticReady = semanticState?.kind === "ready";
  throwIfAborted(control);

  const diagnostics = await collectDiagnostics({
    service: semanticReady ? runtime : null,
    included,
    scope: diagnosticsScope,
    cwd: deps.cwd,
    unavailableReason: diagnosticUnavailableReason(semanticState),
    detailed: level === "detailed",
    requestControl: control,
  });
  const servers = collectServers(runtime, included);
  const capabilityWarnings = collectCapabilityWarnings(semanticRequested, deps);

  const data: HealthData = {
    includedSections: included,
    semanticState,
    serverInventoryAvailable,
    structuralAvailable: capabilityStates.structural.kind === "ready",
    structuralStatus: describeStructuralState(capabilityStates.structural),
    diagnostics,
    servers,
    refresh,
    level,
    capabilityWarnings: capabilityWarnings?.hasWarnings ? capabilityWarnings : undefined,
  };

  return { kind: "completed", data };
}

function healthNeedsSemantic(included: readonly HealthSection[]): boolean {
  return included.includes("diagnostics") || included.includes("servers");
}

interface SemanticHealthStateOptions {
  requested: boolean;
  runtime: WorkspaceLspRuntime | null;
  scopeFilter: string | null;
  lspState: WorkspaceLspRuntimeState;
  capabilityState: CapabilityState;
  control?: WorkflowControl;
}

async function establishSemanticHealthState(
  options: SemanticHealthStateOptions,
): Promise<SemanticHealthState | null> {
  if (!options.requested) return null;
  if (options.runtime && isScopedFile(options.scopeFilter)) {
    const readiness = await options.runtime.waitUntilReadyForFile(
      options.scopeFilter,
      undefined,
      options.control,
    );
    if (readiness.kind === "ready") return { kind: "ready" };
    if (readiness.kind === "timeout") {
      return { kind: "pending", reason: "File semantic readiness timed out" };
    }
    return { kind: "unavailable", reason: readiness.reason };
  }
  if (
    options.runtime
      ?.getProjectServers()
      .some((server) => server.status === "running" && server.ready === true)
  ) {
    return { kind: "ready" };
  }
  return deriveNonReadySemanticState(options.lspState, options.capabilityState);
}

function deriveNonReadySemanticState(
  lspState: WorkspaceLspRuntimeState,
  capabilityState: CapabilityState,
): Exclude<SemanticHealthState, { kind: "ready" }> {
  switch (lspState.kind) {
    case "pending":
      return { kind: "pending", reason: "LSP is starting" };
    case "inactive":
      return { kind: "inactive", reason: "Inactive on the current session branch" };
    case "disabled":
      return { kind: "disabled", reason: "Disabled by configuration" };
    case "unavailable":
      return { kind: "unavailable", reason: lspState.reason };
    case "ready":
      return deriveReadyOwnerWithoutServerState(capabilityState);
  }
}

function deriveReadyOwnerWithoutServerState(
  capabilityState: CapabilityState,
): Exclude<SemanticHealthState, { kind: "ready" }> {
  switch (capabilityState.kind) {
    case "inactive":
      return { kind: "inactive", reason: "Inactive on the current session branch" };
    case "disabled":
      return { kind: "disabled", reason: "Disabled by configuration" };
    case "unavailable":
      return { kind: "unavailable", reason: capabilityState.reason };
    case "pending":
    case "ready":
      return { kind: "pending", reason: "No active, ready project servers" };
  }
}

function collectCapabilityWarnings(
  semanticRequested: boolean,
  deps: HealthWorkflowDeps,
): HealthData["capabilityWarnings"] {
  if (!semanticRequested) return undefined;
  const report = evaluateCapabilityWarnings(
    gatherCapabilityWarningInput(deps.cwd, deps.lspController),
  );
  return report.hasWarnings ? report : undefined;
}

interface RefreshStateOptions {
  readonly refreshRequested: boolean;
  readonly diagnosticsRequested: boolean;
  readonly runtime: WorkspaceLspRuntime | null;
  readonly lspState: WorkspaceLspRuntimeState;
  readonly diagnosticsScope: HealthDiagnosticScope;
  readonly deps: HealthWorkflowDeps;
  readonly control?: WorkflowControl;
}

/** Run the requested workspace-runtime refresh and retain only facts the runtime establishes. */
async function collectRefreshState(options: RefreshStateOptions): Promise<HealthRefreshState> {
  const { deps, diagnosticsRequested, diagnosticsScope, lspState, runtime } = options;
  if (!diagnosticsRequested) {
    return {
      kind: "not-requested",
      reason: "Diagnostics were not requested.",
      lastAttempt: deps.lastRefreshAttempt,
    };
  }
  if (!options.refreshRequested) {
    return {
      kind: "not-requested",
      reason: "Refresh was not requested.",
      lastAttempt: deps.lastRefreshAttempt,
    };
  }
  if (!runtime) {
    return {
      kind: "not-attempted",
      reason: refreshUnavailableReason(lspState),
      lastAttempt: deps.lastRefreshAttempt,
    };
  }

  const attemptedAt = Date.now();
  const operationScope = diagnosticsScope.kind === "file" ? "file-runtime" : "workspace-runtime";
  try {
    reportProgress(options.control, {
      intent: "health",
      phase: "maintenance",
      message: "Refreshing LSP state and sentinel snapshot",
    });
    const attempt =
      diagnosticsScope.kind === "file"
        ? await collectFileRefreshAttempt(runtime, diagnosticsScope, attemptedAt, options)
        : await collectWorkspaceRefreshAttempt(runtime, diagnosticsScope, attemptedAt, options);
    deps.trackRefreshAttempt(attempt);
    return attempt;
  } catch (error) {
    const attempt: HealthRefreshAttempt = {
      kind: "failed",
      attemptedAt,
      requestedDiagnosticScope: diagnosticsScope,
      operationScope,
      reason: errorMessage(error),
    };
    deps.trackRefreshAttempt(attempt);
    return attempt;
  }
}

async function collectFileRefreshAttempt(
  runtime: WorkspaceLspRuntime,
  diagnosticsScope: Extract<HealthDiagnosticScope, { kind: "file" }>,
  attemptedAt: number,
  options: RefreshStateOptions,
): Promise<Extract<HealthRefreshAttempt, { kind: "completed" }>> {
  const maintenance = await refreshFileLspMaintenance(
    runtime,
    options.deps.cwd,
    options.deps.sentinelSnapshot,
    diagnosticsScope.path,
  );
  updateSentinelSnapshot(options.deps.sentinelSnapshot, maintenance.snapshot);
  const readiness = await runtime.waitUntilReadyForFile(
    diagnosticsScope.path,
    undefined,
    options.control,
  );
  const targeted = readiness.kind === "ready" ? 1 : 0;
  return {
    kind: "completed",
    attemptedAt,
    requestedDiagnosticScope: diagnosticsScope,
    operationScope: "file-runtime",
    attemptedActiveClients: targeted,
    restartedClients: 0,
    staleAssessment: {
      scope: "file",
      suspected: null,
      matchedFileCount: maintenance.matchedStaleFileCount,
      warning: null,
    },
  };
}

async function collectWorkspaceRefreshAttempt(
  runtime: WorkspaceLspRuntime,
  diagnosticsScope: HealthDiagnosticScope,
  attemptedAt: number,
  options: RefreshStateOptions,
): Promise<Extract<HealthRefreshAttempt, { kind: "completed" }>> {
  updateSentinelSnapshot(
    options.deps.sentinelSnapshot,
    await refreshLspMaintenance(
      runtime,
      options.deps.cwd,
      options.deps.sentinelSnapshot,
      options.control,
    ),
  );
  const recovery = await recoverDiagnosticRuntime({
    service: runtime,
    control: options.control,
    progress: () =>
      reportProgress(options.control, {
        intent: "health",
        phase: "recovery",
        message: "Refreshing diagnostics and recovery state",
      }),
  });
  return {
    kind: "completed",
    attemptedAt,
    requestedDiagnosticScope: diagnosticsScope,
    operationScope: "workspace-runtime",
    attemptedActiveClients: recovery.attemptedClients,
    restartedClients: recovery.restartedClients,
    staleAssessment: {
      scope: "workspace",
      suspected: recovery.staleAssessment.suspected,
      matchedFileCount: recovery.staleAssessment.matchedFiles.length,
      warning: recovery.staleAssessment.warning,
    },
  };
}

function updateSentinelSnapshot(target: Map<string, number>, next: Map<string, number>): void {
  target.clear();
  for (const [key, value] of next) target.set(key, value);
}

function refreshUnavailableReason(lspState: WorkspaceLspRuntimeState): string {
  switch (lspState.kind) {
    case "unavailable":
      return `LSP runtime unavailable — ${lspState.reason}`;
    case "disabled":
      return "LSP runtime is disabled by configuration.";
    case "inactive":
      return "LSP runtime is inactive on the current session branch.";
    case "pending":
      return "LSP runtime is still starting.";
    case "ready":
      return "No ready LSP runtime is available.";
  }
}

function diagnosticUnavailableReason(state: SemanticHealthState | null): string {
  if (!state) return "Semantic diagnostics were not requested.";
  return state.kind === "ready" ? "No ready LSP runtime is available." : state.reason;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Diagnostic refresh failed.";
}

function prepareHealthRequest(
  input: HealthWorkflowInput,
  cwd: string,
): InputValidation<{
  request: HealthWorkflowInput;
  scopeFilter: string | null;
  included: HealthSection[];
  level: "summary" | "detailed";
}> {
  const parsed = parseHealthWorkflowInput(input);
  if (parsed.kind === "invalid-input") return parsed;
  const request = parsed.value;
  const scope = resolveScope(request.scope, cwd);
  if (scope.kind === "error") return { kind: "invalid-input", message: scope.reason };
  return {
    kind: "valid",
    value: {
      request,
      scopeFilter: scope.path === cwd ? null : scope.path,
      included: request.include === undefined ? [...DEFAULT_INCLUDE] : [...request.include],
      level: request.level ?? "summary",
    },
  };
}
