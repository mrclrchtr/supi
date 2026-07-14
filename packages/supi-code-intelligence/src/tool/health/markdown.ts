/**
 * Markdown renderer for code_health results.
 *
 * Renders structured health data from the code_health executor into
 * readable markdown sections keyed by requested `include` values.
 */

import { renderEvidenceListMetadataDisclosure } from "../../analysis/evidence.ts";
import { formatGitContext } from "../../analysis/signals/git.ts";
import type { HealthCodeActions, HealthData, HealthResultAssembly } from "../result/health.ts";

export type {
  CodeActionSuggestion,
  HealthCodeActions,
  HealthCoverageData,
  HealthData,
  HealthSection,
  HealthUnusedData,
} from "../result/health.ts";

export function renderHealthResult(result: HealthResultAssembly, cwd: string): string {
  const data = result.data;
  const lines: string[] = ["## Code Health", ""];

  renderStatusLine(lines, data);
  renderStalenessBanner(lines, data);

  if (data.includedSections.includes("diagnostics")) {
    renderDiagnosticsSection(lines, data, cwd);
  }
  if (data.includedSections.includes("coverage")) {
    renderCoverageSection(lines, data, cwd);
  }
  if (data.includedSections.includes("unused")) {
    renderUnusedSection(lines, data, cwd);
  }
  renderDegradedCoverageSection(lines, data);
  if (data.includedSections.includes("servers")) {
    renderServersSection(lines, data);
  }
  if (data.includedSections.includes("dirty")) {
    renderDirtySection(lines, data);
  }

  return lines.join("\n");
}

function renderStalenessBanner(lines: string[], data: HealthData): void {
  if (data.diagnosticAgeSeconds == null) {
    lines.push("⚠ Diagnostics have not been refreshed this session. Use `refresh: true` to check.");
    lines.push("");
    return;
  }
  if (data.diagnosticAgeSeconds < 60) return;
  const age =
    data.diagnosticAgeSeconds < 120
      ? `${Math.round(data.diagnosticAgeSeconds)}s ago`
      : `${Math.round(data.diagnosticAgeSeconds / 60)}m ago`;
  lines.push(`⚠ Diagnostics are ${age}. Use \`refresh: true\` to re-check.`);
  lines.push("");
}

function renderDegradedCoverageSection(lines: string[], data: HealthData): void {
  if (!data.degradedCoverage?.hasWarnings) return;

  lines.push("### Degraded Coverage");
  lines.push("");

  for (const warning of data.degradedCoverage.warnings) {
    const lang = warning.language ? `[${warning.language}] ` : "";
    lines.push(`- ⚠ ${lang}${warning.message}`);
    if (warning.detail) {
      lines.push(`  — ${warning.detail}`);
    }
  }
  lines.push("");
}

function renderStatusLine(lines: string[], data: HealthData): void {
  lines.push(`**LSP**: ${data.lspStatus}`);
  if (data.structuralStatus) {
    lines.push(`**Structural**: ${data.structuralStatus}`);
  }
  if (data.recovered) {
    lines.push("**Recovery**: diagnostics refreshed");
  }
  lines.push("");
}

function renderDiagnosticsSection(lines: string[], data: HealthData, cwd: string): void {
  lines.push("### Diagnostics");
  lines.push("");

  if (data.diagnostics.length === 0) {
    lines.push("No diagnostics found.");
  } else if (data.level === "summary") {
    renderDiagnosticSummary(lines, data);
  } else {
    renderDiagnosticDetails(lines, data, cwd);
  }

  renderCodeActionsSection(lines, data, cwd);
  lines.push("");
}

function renderDiagnosticSummary(lines: string[], data: HealthData): void {
  const totalErrors = data.diagnostics.reduce((sum, d) => sum + d.errors, 0);
  const totalWarnings = data.diagnostics.reduce((sum, d) => sum + d.warnings, 0);
  const fileCount = data.diagnostics.length;
  const s = (n: number) => (n !== 1 ? "s" : "");
  lines.push(
    `${fileCount} file${s(fileCount)} with issues: ${totalErrors} error${s(totalErrors)}, ${totalWarnings} warning${s(totalWarnings)}`,
  );
}

function renderDiagnosticDetails(lines: string[], data: HealthData, cwd: string): void {
  for (const entry of data.diagnostics) {
    const relPath = makeRelative(cwd, entry.file);
    const s = (n: number) => (n !== 1 ? "s" : "");
    lines.push(
      `- \`${relPath}\` — ${entry.errors} error${s(entry.errors)}, ${entry.warnings} warning${s(entry.warnings)}`,
    );
  }
}

function renderCodeActionsSection(lines: string[], data: HealthData, cwd: string): void {
  const codeActions = data.codeActions;
  if (!codeActions) return;
  const disclosure = renderEvidenceListMetadataDisclosure(codeActions.evidence);
  if (codeActions.items.length === 0 && !disclosure) return;

  if (data.level === "summary") {
    renderCodeActionsSummary(lines, codeActions, disclosure);
    return;
  }
  renderDetailedCodeActions(lines, codeActions, cwd, disclosure);
}

function renderCodeActionsSummary(
  lines: string[],
  codeActions: HealthCodeActions,
  disclosure: string | null,
): void {
  const count = codeActions.items.length;
  const summary =
    count > 0
      ? `${count} suggested fix${count !== 1 ? "es" : ""} available. Use \`level: "detailed"\` to see them.`
      : "No suggested fixes were collected.";
  lines.push(`_${summary}_`);
  if (disclosure) lines.push(disclosure);
}

function renderDetailedCodeActions(
  lines: string[],
  codeActions: HealthCodeActions,
  cwd: string,
  disclosure: string | null,
): void {
  lines.push("");
  lines.push("### Code Actions");
  lines.push("");
  if (codeActions.items.length === 0) {
    lines.push("No code-action suggestions were collected.");
  } else {
    lines.push("Available fixes (suggestions only — not applied):");
    lines.push("");
    for (const action of codeActions.items) {
      const relPath = makeRelative(cwd, action.file);
      const kindLabel = action.kind ? ` (${action.kind})` : "";
      lines.push(`- \`${relPath}:${action.line}\` — "${action.title}"${kindLabel}`);
    }
  }
  if (disclosure) lines.push(disclosure);
}

function renderCoverageSection(lines: string[], data: HealthData, cwd: string): void {
  lines.push("### Coverage");
  lines.push("");

  if (!data.coverage?.available) {
    lines.push(
      `Coverage report unavailable at \`${makeRelative(cwd, data.coverage?.reportPath ?? "coverage/coverage-summary.json")}\`; this locator does not establish that no coverage report exists elsewhere.`,
    );
    lines.push("");
    return;
  }

  if (data.coverage.entries.length === 0) {
    lines.push("No low-coverage files found.");
    lines.push("");
    return;
  }

  for (const entry of data.coverage.entries) {
    lines.push(`- \`${makeRelative(cwd, entry.file)}\` — ${entry.pct.toFixed(0)}%`);
  }
  lines.push("");
}

function renderUnusedSection(lines: string[], data: HealthData, cwd: string): void {
  lines.push("### Unused");
  lines.push("");

  if (!data.unused?.available) {
    lines.push(
      `Unused-code report unavailable at \`${makeRelative(cwd, data.unused?.reportPath ?? "knip.json")}\`; this locator does not establish that no unused-code report exists elsewhere.`,
    );
    lines.push("");
    return;
  }

  if (data.unused.files.length === 0 && data.unused.exports.length === 0) {
    lines.push("No unused files or exports reported.");
    lines.push("");
    return;
  }

  for (const file of data.unused.files) {
    lines.push(`- Unused file: \`${makeRelative(cwd, file)}\``);
  }
  for (const entry of data.unused.exports) {
    lines.push(`- Unused export: \`${entry.name}\` in \`${makeRelative(cwd, entry.file)}\``);
  }
  lines.push("");
}

function renderServersSection(lines: string[], data: HealthData): void {
  lines.push("### Servers");
  lines.push("");

  if (data.servers.length === 0) {
    lines.push("No servers found.");
    lines.push("");
    return;
  }

  for (const server of data.servers) {
    const statusIcon = server.status === "running" ? "✓" : "✗";
    const types = server.fileTypes.join(", ");
    lines.push(`- ${statusIcon} **${server.name}** (${types}) — ${server.status}`);
  }
  lines.push("");
}

function renderDirtySection(lines: string[], data: HealthData): void {
  if (!data.gitContext) return;
  lines.push(formatGitContext(data.gitContext));
}

function makeRelative(cwd: string, file: string): string {
  if (file.startsWith(cwd)) {
    return file.slice(cwd.length + 1);
  }
  return file;
}
