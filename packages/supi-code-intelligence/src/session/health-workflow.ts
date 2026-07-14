/** Session-owned workspace health workflow. */

import type { LspRuntimeController } from "@mrclrchtr/supi-lsp/api";
import {
  evaluateCoverageWarnings,
  gatherCoverageEvalInput,
} from "../analysis/coverage/coverage-warnings.ts";
import { collectCodeActions, collectDiagnostics } from "../analysis/health/diagnostics.ts";
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
} from "./health-types.ts";
import type { InputValidation } from "./input/common.ts";
import { parseHealthWorkflowInput } from "./input/health-refactor.ts";
import { reportProgress, throwIfAborted, type WorkflowControl } from "./workflow-control.ts";

const DEFAULT_INCLUDE: HealthSection[] = ["diagnostics", "servers"];

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
  throwIfAborted(control);
  if (request.refresh) deps.trackRefresh();

  reportProgress(control, {
    intent: "health",
    phase: "collection",
    message: "Collecting workspace health evidence",
  });

  const lspState = deps.capability.getLspRuntimeState(deps.cwd);
  const capabilityStates = deps.capability.getCapabilityStates(deps.cwd);
  const runtime = lspState.kind === "ready" ? lspState.runtime : null;
  const recovery = await maybeRecover({
    service: runtime,
    refresh: request.refresh,
    lspState,
    semanticStateKind: capabilityStates.semantic.kind,
    progress: () =>
      reportProgress(control, {
        intent: "health",
        phase: "recovery",
        message: "Refreshing diagnostics and recovery state",
      }),
  });
  throwIfAborted(control);

  const diagnostics = await collectDiagnostics(runtime, included, scopeFilter, deps.cwd);
  const servers = collectServers(runtime, included);
  const gitContext = collectGitContext(included, deps.cwd);
  const prioritizationSignals = needsPrioritizationSignals(included)
    ? loadPrioritizationSignals(deps.cwd, lspState, {
        coveragePath: request.coveragePath,
        unusedPath: request.unusedPath,
      })
    : null;
  const coverage = included.includes("coverage")
    ? collectCoverageSection(prioritizationSignals, deps.cwd, scopeFilter, request.coveragePath)
    : null;
  const unused = included.includes("unused")
    ? collectUnusedSection(prioritizationSignals, deps.cwd, scopeFilter, request.unusedPath)
    : null;
  const codeActions =
    level === "detailed" && included.includes("diagnostics")
      ? await collectCodeActions(runtime, scopeFilter, deps.cwd)
      : null;
  const degradedCoverage = evaluateCoverageWarnings(
    gatherCoverageEvalInput(deps.cwd, deps.lspController),
  );
  const refreshTime = request.refresh ? Date.now() : deps.lastRefresh;
  const diagnosticAgeSeconds =
    refreshTime == null ? undefined : Math.round((Date.now() - refreshTime) / 1000);

  const data: HealthData = {
    includedSections: included,
    lspAvailable: runtime !== null,
    lspStatus: recovery.lspStatus,
    recovered: recovery.recovered,
    structuralStatus: describeStructuralState(capabilityStates.structural),
    diagnostics,
    servers,
    gitContext,
    scopeFilter: request.scope ? scopeFilter : null,
    level,
    codeActions,
    coverage,
    unused,
    degradedCoverage: degradedCoverage.hasWarnings ? degradedCoverage : undefined,
    diagnosticAgeSeconds,
  };

  return { kind: "completed", data };
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
      included: request.include?.length ? [...request.include] : DEFAULT_INCLUDE,
      level: request.level ?? "summary",
    },
  };
}
