/**
 * Markdown renderer for code_health results.
 *
 * Renders structured health data from the code_health executor into
 * readable markdown sections keyed by requested `include` values.
 */

import type { CapabilityWarningReport } from "../../analysis/capability/capability-warnings.ts";
import type {
  HealthData,
  HealthDiagnosticObservation,
  HealthDiagnosticScope,
  HealthRefreshAttempt,
  HealthResultAssembly,
  HealthSection,
} from "./result.ts";
import { formatSemanticHealthState } from "./semantic-state.ts";

export type {
  HealthData,
  HealthDiagnosticObservation,
  HealthDiagnosticScope,
  HealthRefreshAttempt,
  HealthRefreshState,
  HealthSection,
  SemanticHealthState,
} from "./result.ts";

export function renderHealthResult(result: HealthResultAssembly, cwd: string): string {
  const data = result.data;
  const lines: string[] = ["## Code Health", ""];
  const hasSection = (key: HealthSection): boolean =>
    result.assembled.sections.some((section) => section.key === `health.${key}`);
  const hasDiagnostics = hasSection("diagnostics");
  const semanticRequested = hasDiagnostics || hasSection("servers");

  renderStatusLine(lines, data, semanticRequested);
  renderRefreshStatus(lines, data, hasDiagnostics, cwd);
  if (hasDiagnostics) renderDiagnosticsSection(lines, data, cwd);
  if (semanticRequested) renderCapabilityWarningsSection(lines, result.details.capabilityWarnings);
  if (hasSection("servers")) renderServersSection(lines, data, sectionStatus(result, "servers"));
  return lines.join("\n");
}

function renderRefreshStatus(
  lines: string[],
  data: HealthData,
  hasDiagnostics: boolean,
  cwd: string,
): void {
  if (!hasDiagnostics) return;

  switch (data.refresh.kind) {
    case "completed":
      lines.push(
        `**${refreshAttemptLabel(data.refresh)}**: ${asSentence(completedRefreshText(data.refresh))}`,
      );
      lines.push(`**Stale assessment**: ${asSentence(staleAssessmentText(data.refresh))}`);
      lines.push("");
      return;
    case "failed": {
      const evidence = data.refresh.diagnosticEvidence
        ? `; ${formatDiagnosticEvidence(data.refresh.diagnosticEvidence)}`
        : "";
      lines.push(
        `**${refreshAttemptLabel(data.refresh)}**: failed — ${data.refresh.reason}${evidence}`,
      );
      lines.push("");
      return;
    }
    case "not-attempted":
      lines.push(`**Diagnostic refresh attempt**: not started — ${data.refresh.reason}`);
      if (data.refresh.lastAttempt) renderLastAttempt(lines, data.refresh.lastAttempt, cwd);
      lines.push("");
      return;
    case "not-requested":
      if (data.refresh.lastAttempt) {
        renderLastAttempt(lines, data.refresh.lastAttempt, cwd);
      } else {
        lines.push(
          "**Diagnostic refresh attempt**: not requested this session. Use `refresh: true` to try one.",
        );
      }
      lines.push("");
  }
}

function completedRefreshText(
  attempt: Extract<HealthRefreshAttempt, { kind: "completed" }>,
): string {
  const base =
    attempt.attemptedActiveClients === 0 && attempt.restartedClients === 0
      ? "completed no-op — no active clients were targeted"
      : `completed — ${attempt.attemptedActiveClients} active client${plural(attempt.attemptedActiveClients)} targeted, ${attempt.restartedClients} restarted`;
  return attempt.operationScope === "workspace-runtime"
    ? `${base}; ${formatDiagnosticEvidence(attempt.diagnosticEvidence)}`
    : base;
}

function refreshAttemptLabel(attempt: Pick<HealthRefreshAttempt, "operationScope">): string {
  return attempt.operationScope === "file-runtime"
    ? "File LSP maintenance attempt"
    : "Diagnostic refresh attempt";
}

function staleAssessmentText(
  attempt: Extract<HealthRefreshAttempt, { kind: "completed" }>,
): string {
  if (attempt.staleAssessment.warning) return attempt.staleAssessment.warning;
  const matches = `${attempt.staleAssessment.matchedFileCount} file${plural(attempt.staleAssessment.matchedFileCount)} match the stale-module heuristic`;
  if (attempt.staleAssessment.scope === "file") {
    return `${matches} in the requested file; workspace clustering was not assessed`;
  }
  return attempt.staleAssessment.suspected
    ? `${matches}; a clustered stale-module pattern is suspected`
    : `${matches}; no clustered stale-module pattern is suspected`;
}

function renderLastAttempt(lines: string[], attempt: HealthRefreshAttempt, cwd: string): void {
  const outcome =
    attempt.kind === "completed"
      ? completedRefreshText(attempt)
      : `failed — ${attempt.reason}${attempt.diagnosticEvidence ? `; ${formatDiagnosticEvidence(attempt.diagnosticEvidence)}` : ""}`;
  const label = refreshAttemptLabel(attempt);
  lines.push(
    `**Last ${label.toLowerCase()}**: ${asSentence(outcome)} Started ${formatElapsed(Date.now() - attempt.attemptedAt)}; requested ${formatDiagnosticScope(attempt.requestedDiagnosticScope, cwd)}; operation scope: ${refreshOperationScopeText(attempt)}.`,
  );
}

function refreshOperationScopeText(attempt: HealthRefreshAttempt): string {
  return attempt.operationScope === "file-runtime" ? "file runtime" : "workspace runtime";
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function renderCapabilityWarningsSection(
  lines: string[],
  report: CapabilityWarningReport | null,
): void {
  if (!report?.hasWarnings) return;

  lines.push("### Capability Warnings");
  lines.push("");

  for (const warning of report.warnings) {
    const lang = warning.language ? `[${warning.language}] ` : "";
    lines.push(`- ⚠ ${lang}${warning.message}`);
    if (warning.detail) lines.push(`  — ${warning.detail}`);
  }
  lines.push("");
}

function renderStatusLine(lines: string[], data: HealthData, semanticRequested: boolean): void {
  if (!semanticRequested) return;

  lines.push(`**LSP**: ${displaySemanticStatus(data)}`);
  if (data.structuralStatus) lines.push(`**Structural**: ${data.structuralStatus}`);
  lines.push("");
}

function renderDiagnosticsSection(lines: string[], data: HealthData, cwd: string): void {
  const observation = data.diagnostics;
  lines.push("### Diagnostics");
  lines.push("");

  if (observation.kind === "not-requested") {
    lines.push("Diagnostics were not requested.");
  } else {
    lines.push(`**Evidence scope**: ${formatDiagnosticScope(observation.scope, cwd)}.`);
    renderFileScopeStatus(lines, observation, cwd);
    // The evidence line is bounded by the client's tracked documents; a file
    // created after the last refresh is pulled on the next pass. Labeling the
    // bound prevents misreading a first-call partial as an exclusion verdict.
    const bound = observation.scope.kind === "tracked-files" ? " (tracked-file bound)" : "";
    lines.push(`**Evidence coverage**: ${formatDiagnosticEvidence(observation.evidence)}${bound}.`);
    lines.push("");
    renderDiagnosticObservation(lines, data, cwd);
  }

  lines.push("");
}

/**
 * Render the tsconfig coverage verdict for a single-file health request.
 *
 * Written in plain vocabulary (no basis terms) so a reader without tsconfig
 * background can act on it: the sentence names the deciding config and states
 * whether the file's errors are part of workspace diagnostics. The structured
 * decision basis stays in the diagnostics.scope debug event.
 */
function renderFileScopeStatus(
  lines: string[],
  observation: Extract<
    HealthDiagnosticObservation,
    { kind: "completed" | "partial" | "unavailable" }
  >,
  cwd: string,
): void {
  if (observation.scope.kind !== "file" || !observation.scopeStatus) return;

  const decision = observation.scopeStatus;
  switch (decision.status) {
    case "included":
      lines.push(
        `**Tsconfig**: covered by ${formatConfigPath(decision.configPath, cwd)} — part of workspace diagnostics.`,
      );
      return;
    case "excluded":
      lines.push(
        `**Tsconfig**: NOT covered by ${formatConfigPath(decision.configPath, cwd)} — not part of workspace diagnostics.`,
      );
      return;
    case "no-config":
      lines.push("**Tsconfig**: no tsconfig.json or jsconfig.json found — nothing filtered.");
      return;
    case "out-of-tree":
      lines.push("**Tsconfig**: outside the project root — not part of workspace diagnostics.");
  }
}

function formatConfigPath(configPath: string | null, cwd: string): string {
  if (!configPath) return "no config";
  return `\`${makeRelative(cwd, configPath)}\``;
}

function formatDiagnosticEvidence(evidence: {
  requested: number;
  confirmed: number;
  unconfirmed: number;
  failed: number;
  removed: number;
}): string {
  return `${evidence.requested} requested, ${evidence.confirmed} confirmed, ${evidence.unconfirmed} unconfirmed, ${evidence.failed} failed, ${evidence.removed} removed`;
}

function renderDiagnosticObservation(lines: string[], data: HealthData, cwd: string): void {
  const observation = data.diagnostics;
  if (observation.kind === "not-requested") return;
  if (observation.kind === "unavailable") {
    lines.push(`Diagnostics unavailable — ${asSentence(observation.reason)}`);
    return;
  }
  if (observation.kind === "partial") {
    lines.push(`Diagnostics partially collected — ${asSentence(observation.reason)}`);
    if (observation.entries.length > 0) {
      lines.push("");
      lines.push("Partial results:");
      renderDiagnosticEntries(lines, data, cwd);
    }
    return;
  }
  if (observation.entries.length === 0) {
    lines.push(emptyDiagnosticText(observation.scope, cwd));
    return;
  }
  renderDiagnosticEntries(lines, data, cwd);
}

function asSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function emptyDiagnosticText(scope: HealthDiagnosticScope, cwd: string): string {
  if (scope.kind === "file") {
    return `No errors or warnings found for \`${makeRelative(cwd, scope.path)}\`.`;
  }
  return scope.filter
    ? `No errors or warnings are reported by the tracked-file diagnostic snapshot under \`${makeRelative(cwd, scope.filter)}\`.`
    : "No errors or warnings are reported by the tracked-file diagnostic snapshot.";
}

function renderDiagnosticEntries(lines: string[], data: HealthData, cwd: string): void {
  const entries = data.diagnostics.entries;
  if (data.level === "summary") {
    renderDiagnosticSummary(lines, entries);
  } else {
    renderDiagnosticDetails(lines, entries, cwd);
  }
}

function renderDiagnosticSummary(
  lines: string[],
  entries: HealthData["diagnostics"]["entries"],
): void {
  const totalErrors = entries.reduce((sum, entry) => sum + entry.errors, 0);
  const totalWarnings = entries.reduce((sum, entry) => sum + entry.warnings, 0);
  lines.push(
    `${entries.length} file${plural(entries.length)} with issues: ${totalErrors} error${plural(totalErrors)}, ${totalWarnings} warning${plural(totalWarnings)}`,
  );
}

function renderDiagnosticDetails(
  lines: string[],
  entries: HealthData["diagnostics"]["entries"],
  cwd: string,
): void {
  for (const entry of entries) {
    lines.push(
      `- \`${makeRelative(cwd, entry.file)}\` — ${entry.errors} error${plural(entry.errors)}, ${entry.warnings} warning${plural(entry.warnings)}`,
    );
    if (entry.messages) {
      for (const msg of entry.messages) {
        const source = msg.source ? ` [${msg.source}]` : "";
        lines.push(`  - L${msg.line} ${msg.severity}${source}: ${msg.message}`);
      }
    }
  }
}

function renderServersSection(
  lines: string[],
  data: HealthData,
  status: "complete" | "partial" | "unavailable" | undefined,
): void {
  lines.push("### Servers");
  lines.push("");
  lines.push("**Inventory scope**: workspace-wide.");
  lines.push("");

  if (status === "unavailable") {
    lines.push(`Server status unavailable — ${displaySemanticStatus(data)}.`);
  } else if (data.servers.length === 0) {
    lines.push("No servers found.");
  } else {
    for (const server of data.servers) {
      const statusIcon = server.status === "running" ? "✓" : "✗";
      lines.push(
        `- ${statusIcon} **${server.name}** (${server.fileTypes.join(", ")}) — ${server.status}`,
      );
    }
  }
  lines.push("");
}

function displaySemanticStatus(data: HealthData): string {
  return formatSemanticHealthState(data.semanticState);
}

function sectionStatus(
  result: HealthResultAssembly,
  key: HealthSection,
): "complete" | "partial" | "unavailable" | undefined {
  return result.assembled.sections.find((section) => section.key === `health.${key}`)?.status;
}

function formatDiagnosticScope(scope: HealthDiagnosticScope, cwd: string): string {
  if (scope.kind === "file")
    return `live file diagnostic request for \`${makeRelative(cwd, scope.path)}\``;
  return scope.filter
    ? `tracked-file diagnostic snapshot under \`${makeRelative(cwd, scope.filter)}\``
    : "tracked-file diagnostic snapshot";
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function makeRelative(cwd: string, file: string): string {
  return file.startsWith(cwd) ? file.slice(cwd.length + 1) : file;
}
