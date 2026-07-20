/** Session-owned workspace health workflow. */

import type { CapabilityState } from "@mrclrchtr/supi-code-runtime/api";
import type {
  LspRuntimeController,
  WorkspaceLspRuntime,
  WorkspaceLspRuntimeState,
} from "@mrclrchtr/supi-lsp/api";
import {
  evaluateCoverageWarnings,
  gatherCoverageEvalInput,
} from "../analysis/coverage/coverage-warnings.ts";
import {
  collectCodeActions,
  collectDiagnostics,
  isScopedFile,
} from "../analysis/health/diagnostics.ts";
import { describeStructuralState, maybeRecover } from "../analysis/health/recovery.ts";
import {
  collectCoverageSection,
  collectGitContext,
  collectServers,
  collectUnusedSection,
  needsPrioritizationSignals,
} from "../analysis/health/signals.ts";
import { resolveScope } from "../analysis/search/ripgrep.ts";
import { loadPrioritizationSignals } from "../analysis/signals/project.ts";
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
  const refreshAttempted = await prepareDiagnosticRefresh({
    runtime,
    request,
    included,
    scopeFilter,
  });
  const recovery = await maybeRecover({
    service: refreshAttempted ? runtime : null,
    refresh: refreshAttempted,
    progress: () =>
      reportProgress(control, {
        intent: "health",
        phase: "recovery",
        message: "Refreshing diagnostics and recovery state",
      }),
  });
  if (refreshAttempted) deps.trackRefresh();
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
  const gitContext = collectGitContext(included, deps.cwd);
  const artifacts = collectHealthArtifacts({
    included,
    request,
    cwd: deps.cwd,
    scopeFilter,
    lspState,
  });
  const codeActions = await collectOptionalCodeActions({
    level,
    included,
    runtime: semanticReady ? runtime : null,
    scopeFilter,
    cwd: deps.cwd,
  });
  const degradedCoverage = collectDegradedCoverage(semanticRequested, deps);
  const diagnosticAgeSeconds = getDiagnosticAgeSeconds(
    included,
    deps.lastRefresh,
    refreshAttempted,
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
    gitContext,
    scopeFilter: request.scope ? scopeFilter : null,
    level,
    codeActions,
    coverage: artifacts.coverage,
    unused: artifacts.unused,
    degradedCoverage: degradedCoverage?.hasWarnings ? degradedCoverage : undefined,
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

async function prepareDiagnosticRefresh(options: {
  runtime: WorkspaceLspRuntime | null;
  request: HealthWorkflowInput;
  included: readonly HealthSection[];
  scopeFilter: string | null;
}): Promise<boolean> {
  const requested = options.request.refresh === true && options.included.includes("diagnostics");
  if (!requested || !options.runtime) return false;
  if (isScopedFile(options.scopeFilter)) {
    try {
      await options.runtime.waitUntilReadyForFile(options.scopeFilter);
    } catch {
      // Recovery still gets a chance to restart a failed routed client.
    }
  }
  return true;
}

function collectHealthArtifacts(options: {
  included: readonly HealthSection[];
  request: HealthWorkflowInput;
  cwd: string;
  scopeFilter: string | null;
  lspState: ReturnType<CapabilityAdapter["getLspRuntimeState"]>;
}): Pick<HealthData, "coverage" | "unused"> {
  const prioritizationSignals = needsPrioritizationSignals([...options.included])
    ? loadPrioritizationSignals(options.cwd, options.lspState, {
        coveragePath: options.request.coveragePath,
        unusedPath: options.request.unusedPath,
      })
    : null;
  return {
    coverage: options.included.includes("coverage")
      ? collectCoverageSection(
          prioritizationSignals,
          options.cwd,
          options.scopeFilter,
          options.request.coveragePath,
        )
      : null,
    unused: options.included.includes("unused")
      ? collectUnusedSection(
          prioritizationSignals,
          options.cwd,
          options.scopeFilter,
          options.request.unusedPath,
        )
      : null,
  };
}

async function collectOptionalCodeActions(options: {
  level: "summary" | "detailed";
  included: readonly HealthSection[];
  runtime: WorkspaceLspRuntime | null;
  scopeFilter: string | null;
  cwd: string;
}): Promise<HealthData["codeActions"]> {
  if (
    options.level !== "detailed" ||
    !options.included.includes("diagnostics") ||
    options.runtime === null
  ) {
    return null;
  }
  return collectCodeActions(options.runtime, options.scopeFilter, options.cwd);
}

function collectDegradedCoverage(
  semanticRequested: boolean,
  deps: HealthWorkflowDeps,
): HealthData["degradedCoverage"] {
  if (!semanticRequested) return undefined;
  const report = evaluateCoverageWarnings(gatherCoverageEvalInput(deps.cwd, deps.lspController));
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
