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
import { collectDiagnostics, isScopedFile } from "../analysis/health/diagnostics.ts";
import { describeStructuralState, maybeRecover } from "../analysis/health/recovery.ts";
import { collectServers } from "../analysis/health/signals.ts";
import { resolveScope } from "../analysis/search/paths.ts";
import { refreshLspMaintenance } from "../substrate/lsp/maintenance.ts";
import type { CapabilityAdapter } from "./capability-adapter.ts";
import type {
  HealthData,
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
  readonly lastRefresh: number | undefined;
  readonly trackRefresh: () => void;
  /** Workspace sentinel snapshot for change detection. */
  readonly sentinelSnapshot: Map<string, number>;
}

/** Collect health facts without rendering a public result. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: health workflow orchestrates multiple diagnostic/semantic/structural collection paths
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

  // When refresh is requested and diagnostics are included, run sentinel-sync,
  // stale-module resync, prune, and refresh before recovery.
  const refreshRequested =
    request.refresh === true && included.includes("diagnostics") && runtime !== null;
  if (refreshRequested) {
    reportProgress(control, {
      intent: "health",
      phase: "maintenance",
      message: "Refreshing LSP state and sentinel snapshot",
    });
    const nextSnapshot = await refreshLspMaintenance(runtime, deps.cwd, deps.sentinelSnapshot);
    // Update the caller's snapshot reference.
    deps.sentinelSnapshot.clear();
    for (const [key, value] of nextSnapshot) {
      deps.sentinelSnapshot.set(key, value);
    }
    if (isScopedFile(scopeFilter)) {
      try {
        await runtime.waitUntilReadyForFile(scopeFilter);
      } catch {
        // Recovery still gets a chance to restart a failed routed client.
      }
    }
  }

  const recovery = await maybeRecover({
    service: refreshRequested ? runtime : null,
    refresh: refreshRequested,
    progress: () =>
      reportProgress(control, {
        intent: "health",
        phase: "recovery",
        message: "Refreshing diagnostics and recovery state",
      }),
  });
  if (refreshRequested) deps.trackRefresh();
  const semanticState = await establishSemanticHealthState({
    requested: semanticRequested,
    runtime,
    scopeFilter,
    lspState,
    capabilityState: capabilityStates.semantic,
  });
  const semanticReady = semanticState?.kind === "ready";
  throwIfAborted(control);

  const diagnostics = await collectDiagnostics(
    semanticReady ? runtime : null,
    included,
    scopeFilter,
    deps.cwd,
  );
  const servers = collectServers(runtime, included);
  const capabilityWarnings = collectCapabilityWarnings(semanticRequested, deps);
  const diagnosticAgeSeconds = getDiagnosticAgeSeconds(
    included,
    deps.lastRefresh,
    refreshRequested,
  );

  const data: HealthData = {
    includedSections: included,
    semanticState,
    serverInventoryAvailable,
    recovered: recovery.recovered,
    structuralAvailable: capabilityStates.structural.kind === "ready",
    structuralStatus: describeStructuralState(capabilityStates.structural),
    diagnostics,
    servers,
    scopeFilter: request.scope ? scopeFilter : null,
    level,
    capabilityWarnings: capabilityWarnings?.hasWarnings ? capabilityWarnings : undefined,
    diagnosticAgeSeconds,
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
}

async function establishSemanticHealthState(
  options: SemanticHealthStateOptions,
): Promise<SemanticHealthState | null> {
  if (!options.requested) return null;
  if (options.runtime && isScopedFile(options.scopeFilter)) {
    const readiness = await options.runtime.waitUntilReadyForFile(options.scopeFilter);
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

function getDiagnosticAgeSeconds(
  included: readonly HealthSection[],
  lastRefresh: number | undefined,
  refreshAttempted: boolean,
): number | undefined {
  if (!included.includes("diagnostics")) return undefined;
  const refreshTime = refreshAttempted ? Date.now() : lastRefresh;
  return refreshTime == null ? undefined : Math.round((Date.now() - refreshTime) / 1000);
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
