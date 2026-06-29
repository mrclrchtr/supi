/**
 * Health orchestration use-case — gathers workspace health data and
 * returns a rendered CodeIntelResult with structured details.
 *
 * Thin dispatcher: collects all requested sections, assembles the
 * HealthData object, and delegates rendering to the markdown module.
 * Section-specific collection lives in ./sections/.
 */

import type { AgentToolUpdateCallback } from "@earendil-works/pi-coding-agent";
import type { CapabilityState } from "@mrclrchtr/supi-code-runtime/api";
import type { SessionLspServiceState } from "@mrclrchtr/supi-lsp/api";
import {
  evaluateCoverageWarnings,
  gatherCoverageEvalInput,
} from "../../analysis/coverage/coverage-warnings.ts";
import { loadPrioritizationSignals } from "../../analysis/signals/project.ts";
import type { CodeIntelResult, HealthDetails } from "../../types/index.ts";
import type { HealthData, HealthSection } from "./markdown.ts";
import { renderHealthResult } from "./markdown.ts";
import { collectCodeActions, collectDiagnostics } from "./sections/diagnostics.ts";
import {
  buildHealthEvidenceLists,
  describeStructuralState,
  maybeRecover,
} from "./sections/recovery.ts";
import {
  collectCoverageSection,
  collectGitContext,
  collectServers,
  collectUnusedSection,
  needsPrioritizationSignals,
} from "./sections/signals.ts";

export interface HealthInput {
  scope?: string;
  refresh?: boolean;
  include?: string[];
  level?: "summary" | "detailed";
  coveragePath?: string;
  unusedPath?: string;
}

export interface HealthDeps {
  cwd: string;
  lspState: SessionLspServiceState;
  providerAvailable: boolean;
  semanticStateKind: "pending" | "ready" | "inactive" | "disabled" | "unavailable";
  structuralState: CapabilityState;
  lspController: import("@mrclrchtr/supi-lsp/api").LspRuntimeController | null;
  onUpdate?: AgentToolUpdateCallback;
  scopeFilter: string | null;
  lastRefresh: number | undefined;
}

const DEFAULT_INCLUDE: HealthSection[] = ["diagnostics", "servers"];

/** Last diagnostic refresh time by workspace path (for staleness banner). */
const lastRefreshByWorkspace = new Map<string, number>();

/** Track a diagnostic refresh for the given workspace. */
export function trackHealthRefresh(cwd: string): void {
  lastRefreshByWorkspace.set(cwd, Date.now());
}

/** Get the last refresh time for a workspace. */
export function getLastHealthRefresh(cwd: string): number | undefined {
  return lastRefreshByWorkspace.get(cwd);
}

/**
 * Execute the health gathering use-case.
 */
export async function executeHealth(
  input: HealthInput,
  deps: HealthDeps,
): Promise<CodeIntelResult> {
  const cwd = deps.cwd;
  const included = (
    input.include && input.include.length > 0 ? input.include : DEFAULT_INCLUDE
  ) as HealthSection[];
  const level = input.level ?? "summary";

  const service = deps.lspState.kind === "ready" ? deps.lspState.service : null;

  const { recovered, lspStatus } = await maybeRecover({
    service,
    refresh: input.refresh,
    lspState: deps.lspState,
    semanticStateKind: deps.semanticStateKind,
    onUpdate: deps.onUpdate,
  });
  const structuralStatus = describeStructuralState(deps.structuralState);

  const diagnostics = await collectDiagnostics(service, included, deps.scopeFilter, cwd);
  const servers = collectServers(service, included);
  const gitContext = collectGitContext(included, cwd);
  const prioritizationSignals = needsPrioritizationSignals(included)
    ? loadPrioritizationSignals(cwd, deps.lspState, {
        coveragePath: input.coveragePath,
        unusedPath: input.unusedPath,
      })
    : null;
  const coverage = included.includes("coverage")
    ? collectCoverageSection(prioritizationSignals, cwd, deps.scopeFilter, input.coveragePath)
    : null;
  const unused = included.includes("unused")
    ? collectUnusedSection(prioritizationSignals, cwd, deps.scopeFilter, input.unusedPath)
    : null;

  const codeActions =
    level === "detailed" && included.includes("diagnostics")
      ? await collectCodeActions(service, deps.scopeFilter, cwd)
      : null;

  const degradedCoverage = evaluateCoverageWarnings(
    gatherCoverageEvalInput(cwd, deps.lspController),
  );

  const diagnosticAgeSeconds =
    deps.lastRefresh != null ? Math.round((Date.now() - deps.lastRefresh) / 1000) : undefined;

  const data: HealthData = {
    includedSections: included,
    lspAvailable: service !== null,
    lspStatus,
    recovered,
    structuralStatus,
    diagnostics,
    servers,
    gitContext,
    scopeFilter: input.scope ? deps.scopeFilter : null,
    level,
    codeActions,
    coverage,
    unused,
    degradedCoverage: degradedCoverage.hasWarnings ? degradedCoverage : undefined,
    diagnosticAgeSeconds,
  };

  const evidenceLists = buildHealthEvidenceLists(gitContext);
  const content = renderHealthResult(data, cwd);

  return {
    content,
    details: {
      type: "health",
      data: {
        lspAvailable: data.lspAvailable,
        lspStatus: data.lspStatus,
        recovered: data.recovered,
        structuralStatus: data.structuralStatus,
        diagnosticFileCount: data.diagnostics.length,
        serverCount: data.servers.length,
        evidenceLists,
      } satisfies HealthDetails,
    },
  };
}
