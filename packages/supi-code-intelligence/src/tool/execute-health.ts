// biome-ignore-all lint/style/noExcessiveLinesPerFile: health orchestration keeps public sections together
/**
 * Tool executor for code_health.
 *
 * Reads LSP diagnostics, server status, and git dirty state.
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentToolUpdateCallback } from "@earendil-works/pi-coding-agent";
import type { CapabilityState } from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/api";
import type { SessionLspService, SessionLspServiceState } from "@mrclrchtr/supi-lsp/api";
import { createEvidenceList, type EvidenceListMetadata } from "../evidence-list.ts";
import { gatherGitContext } from "../git-context.ts";
import { evaluateCoverageWarnings, gatherCoverageEvalInput } from "../lsp/coverage-warnings.ts";
import {
  type CodeActionSuggestion,
  type HealthCoverageData,
  type HealthData,
  type HealthSection,
  type HealthUnusedData,
  renderHealthResult,
} from "../presentation/markdown/health.ts";
import { type LoadedSignals, loadPrioritizationSignals } from "../prioritization-signals.ts";
import { resolveScope } from "../search-helpers.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../types.ts";
import { unavailableHealthDetails } from "./details-helpers.ts";
import { emitToolProgress } from "./progress.ts";

export interface CodeHealthToolParams {
  scope?: string;
  refresh?: boolean;
  include?: string[];
  level?: "summary" | "detailed";
  coveragePath?: string;
  unusedPath?: string;
}

const DEFAULT_INCLUDE: HealthSection[] = ["diagnostics", "servers"];

/** Last diagnostic refresh time by workspace path (for staleness banner). */
const lastRefreshByWorkspace = new Map<string, number>();

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: pre-existing complexity with minor staleness tracking additions
export async function executeHealthTool(
  params: CodeHealthToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const cwd = ctx.cwd;
  emitToolProgress(ctx.onUpdate, "code_health: gathering workspace health...");
  const included = (
    params.include && params.include.length > 0 ? params.include : DEFAULT_INCLUDE
  ) as HealthSection[];
  const level = params.level ?? "summary";

  const scopeResolution = resolveScope(params.scope, cwd);
  if (scopeResolution.kind === "error") {
    return {
      content: `**Error:** ${scopeResolution.reason}`,
      details: unavailableHealthDetails("scope not found"),
    };
  }
  const scopeFilter = scopeResolution.path === cwd ? null : scopeResolution.path;

  const providerState = ctx.session.getProviders();
  const workspaceState = ctx.session.getWorkspaceState();
  const semanticState = workspaceState.semantic.state;
  const structuralState = workspaceState.structural.state;
  const lspState: SessionLspServiceState =
    providerState.kind === "ready"
      ? providerState.lspService
      : { kind: "unavailable", reason: "No provider" };
  const service = lspState.kind === "ready" ? lspState.service : null;

  // Track diagnostic freshness for staleness banner.
  const now = Date.now();
  if (params.refresh) {
    lastRefreshByWorkspace.set(cwd, now);
  }
  const lastRefresh = lastRefreshByWorkspace.get(cwd);
  const diagnosticAgeSeconds =
    lastRefresh != null ? Math.round((now - lastRefresh) / 1000) : undefined;

  const { recovered, lspStatus } = await maybeRecover({
    service,
    refresh: params.refresh,
    lspState,
    semanticStateKind: semanticState.kind,
    onUpdate: ctx.onUpdate,
  });
  const structuralStatus = describeStructuralState(structuralState);

  const diagnostics = await collectDiagnostics(service, included, scopeFilter, cwd);
  const servers = collectServers(service, included);
  const gitContext = included.includes("dirty") ? gatherGitContext(cwd) : null;
  const prioritizationSignals = needsPrioritizationSignals(included)
    ? loadPrioritizationSignals(cwd, lspState, {
        coveragePath: params.coveragePath,
        unusedPath: params.unusedPath,
      })
    : null;
  const coverage = included.includes("coverage")
    ? collectCoverageSection(prioritizationSignals, cwd, scopeFilter, params.coveragePath)
    : null;
  const unused = included.includes("unused")
    ? collectUnusedSection(prioritizationSignals, cwd, scopeFilter, params.unusedPath)
    : null;

  // Code actions only in detailed mode to avoid unnecessary LSP calls
  const codeActions =
    level === "detailed" && included.includes("diagnostics")
      ? await collectCodeActions(service, scopeFilter, cwd)
      : null;

  // Evaluate degraded coverage through the session's LSP controller (ADR 0008)
  const degradedCoverage = evaluateCoverageWarnings(
    gatherCoverageEvalInput(cwd, ctx.session.lspController),
  );

  const data: HealthData = {
    includedSections: included,
    lspAvailable: service !== null,
    lspStatus,
    recovered,
    structuralStatus,
    diagnostics,
    servers,
    gitContext,
    scopeFilter: params.scope ? scopeFilter : null,
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
      },
    },
  };
}

function buildHealthEvidenceLists(
  gitContext: ReturnType<typeof gatherGitContext>,
): EvidenceListMetadata[] {
  if (!gitContext) return [];
  return [
    createEvidenceList({
      key: "health.dirtyFiles",
      items: gitContext.dirtyFiles,
      maxResults: 5,
    }).metadata,
  ];
}

function needsPrioritizationSignals(included: HealthSection[]): boolean {
  return included.includes("coverage") || included.includes("unused");
}

function collectCoverageSection(
  loaded: LoadedSignals | null,
  cwd: string,
  scopeFilter: string | null,
  coveragePath?: string,
): HealthCoverageData {
  const reportPath = resolve(cwd, coveragePath ?? "coverage/coverage-summary.json");
  if (!existsSync(reportPath) || !loaded) {
    return { available: false, entries: [] };
  }

  const entries = [...loaded.coverageByFile.entries()]
    .filter(([file, pct]) => pct < 50 && isWithinOptionalScope(scopeFilter, file))
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
    .map(([file, pct]) => ({ file, pct }));

  return { available: true, entries };
}

function collectUnusedSection(
  loaded: LoadedSignals | null,
  cwd: string,
  scopeFilter: string | null,
  unusedPath?: string,
): HealthUnusedData {
  const reportPath = resolve(cwd, unusedPath ?? "knip.json");
  if (!existsSync(reportPath) || !loaded) {
    return { available: false, files: [], exports: [] };
  }

  const files = [...loaded.unusedFiles]
    .filter((file) => isWithinOptionalScope(scopeFilter, file))
    .sort((left, right) => left.localeCompare(right));
  const exports = loaded.unusedExports
    .filter((entry) => isWithinOptionalScope(scopeFilter, entry.file))
    .sort((left, right) => left.name.localeCompare(right.name));

  return { available: true, files, exports };
}

function isWithinOptionalScope(scopeFilter: string | null, file: string): boolean {
  return !scopeFilter || isWithinOrEqual(scopeFilter, file);
}

interface RecoverOptions {
  service: SessionLspService | null;
  refresh: boolean | undefined;
  lspState: SessionLspServiceState;
  semanticStateKind?: "pending" | "ready" | "inactive" | "disabled" | "unavailable";
  onUpdate?: AgentToolUpdateCallback;
}

async function maybeRecover(
  opts: RecoverOptions,
): Promise<{ recovered: boolean; lspStatus: string }> {
  const { service, refresh, lspState, semanticStateKind, onUpdate } = opts;
  let recovered = false;
  let lspStatus = semanticStateKind === "pending" ? "warming…" : describeLspState(lspState);

  if (refresh && service) {
    emitToolProgress(onUpdate, "code_health: refreshing diagnostics (may restart LSP)...");
    try {
      await service.recoverDiagnostics({ restartIfStillStale: true });
      recovered = true;
      lspStatus = "ready (recovered)";
    } catch {
      // Recovery failed but we continue
    }
  }

  return { recovered, lspStatus };
}

async function collectDiagnostics(
  service: SessionLspService | null,
  included: string[],
  scopeFilter: string | null,
  cwd: string,
): Promise<HealthData["diagnostics"]> {
  if (!included.includes("diagnostics") || !service) return [];

  if (isScopedFile(scopeFilter)) {
    return collectScopedFileDiagnostics(service, scopeFilter);
  }

  return collectWorkspaceDiagnostics(service, scopeFilter, cwd);
}

function isScopedFile(scopeFilter: string | null): scopeFilter is string {
  return scopeFilter !== null && existsSync(scopeFilter) && !isDirectory(scopeFilter);
}

async function collectScopedFileDiagnostics(
  service: SessionLspService,
  scopeFilter: string,
): Promise<HealthData["diagnostics"]> {
  const diags = await service.fileDiagnostics(scopeFilter, 4);
  if (!diags || diags.length === 0) {
    return [];
  }

  const errors = diags.filter((d) => (d.severity ?? 1) === 1).length;
  const warnings = diags.filter((d) => (d.severity ?? 1) === 2).length;
  if (!hasIssueCounts(errors, warnings)) {
    return [];
  }

  return [{ file: scopeFilter, errors, warnings }];
}

function collectWorkspaceDiagnostics(
  service: SessionLspService,
  scopeFilter: string | null,
  cwd: string,
): HealthData["diagnostics"] {
  const summary = service.getWorkspaceDiagnosticSummary();
  const result: HealthData["diagnostics"] = [];

  for (const entry of summary) {
    const filePath = resolve(cwd, entry.file);
    if (scopeFilter && !isWithinOrEqual(scopeFilter, filePath)) continue;
    if (!hasIssueCounts(entry.errors, entry.warnings)) continue;
    result.push({ file: filePath, errors: entry.errors, warnings: entry.warnings });
  }

  return result;
}

function hasIssueCounts(errors: number, warnings: number): boolean {
  return errors > 0 || warnings > 0;
}

/** Max files to query for code actions in detailed health mode. */
const MAX_CODE_ACTION_FILES = 5;
/** Max total code action suggestions to return. */
const MAX_CODE_ACTION_SUGGESTIONS = 10;

async function collectCodeActions(
  service: SessionLspService | null,
  scopeFilter: string | null,
  cwd: string,
): Promise<CodeActionSuggestion[]> {
  if (!service) return [];

  try {
    const outstanding = service.getOutstandingDiagnostics(1);
    const suggestions = await collectFromOutstanding(service, outstanding, scopeFilter, cwd);
    return suggestions.slice(0, MAX_CODE_ACTION_SUGGESTIONS);
  } catch {
    return [];
  }
}

async function collectFromOutstanding(
  service: SessionLspService,
  outstanding: ReturnType<SessionLspService["getOutstandingDiagnostics"]>,
  scopeFilter: string | null,
  cwd: string,
): Promise<CodeActionSuggestion[]> {
  const suggestions: CodeActionSuggestion[] = [];
  let filesQueried = 0;

  for (const entry of outstanding) {
    if (suggestions.length >= MAX_CODE_ACTION_SUGGESTIONS) break;
    if (filesQueried >= MAX_CODE_ACTION_FILES) break;
    if (scopeFilter && !isWithinScope(scopeFilter, entry.file, cwd)) continue;

    const newSuggestions = await collectFileCodeActions(service, entry);
    if (newSuggestions.length === 0) continue;

    filesQueried++;
    mergeSuggestions(suggestions, newSuggestions);
  }

  return suggestions;
}

function mergeSuggestions(
  existing: CodeActionSuggestion[],
  incoming: CodeActionSuggestion[],
): void {
  const seen = new Set(existing.map((s) => `${s.file}:${s.title}`));
  for (const s of incoming) {
    const key = `${s.file}:${s.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      existing.push(s);
    }
  }
}

async function collectFileCodeActions(
  service: SessionLspService,
  entry: {
    file: string;
    diagnostics: Array<{
      severity?: number;
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    }>;
  },
): Promise<CodeActionSuggestion[]> {
  const errorDiag = entry.diagnostics.find((d) => (d.severity ?? 1) <= 1);
  if (!errorDiag) return [];

  try {
    const actions = await service.codeActions(entry.file, {
      line: errorDiag.range.start.line,
      character: errorDiag.range.start.character,
    });
    if (!actions || actions.length === 0) return [];

    const result: CodeActionSuggestion[] = [];
    for (const a of actions) {
      if (!a.title) continue;
      result.push({
        file: entry.file,
        line: errorDiag.range.start.line + 1,
        title: a.title,
        kind: a.kind ?? undefined,
      });
    }
    return result;
  } catch {
    return [];
  }
}

function isWithinScope(scopeFilter: string, file: string, cwd: string): boolean {
  const absPath = resolve(cwd, file);
  return isWithinOrEqual(scopeFilter, absPath);
}

function collectServers(
  service: SessionLspService | null,
  included: string[],
): HealthData["servers"] {
  if (!included.includes("servers") || !service) return [];

  return service.getProjectServers().map((s) => ({
    name: s.name,
    root: s.root,
    fileTypes: s.fileTypes,
    status: s.status,
  }));
}

function describeLspState(state: SessionLspServiceState): string {
  switch (state.kind) {
    case "ready":
      return "ready";
    case "pending":
      return "starting…";
    case "inactive":
      return "inactive on current session branch";
    case "disabled":
      return "disabled by configuration";
    case "unavailable":
      return `unavailable — ${state.reason}`;
    default:
      return "unknown state";
  }
}

function describeStructuralState(state: CapabilityState): string {
  switch (state.kind) {
    case "ready":
      return "ready";
    case "pending":
      return "starting…";
    case "inactive":
      return "inactive";
    case "disabled":
      return "disabled by configuration";
    case "unavailable":
      return `unavailable — ${state.reason}`;
    default:
      return "unknown state";
  }
}

function isDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}
