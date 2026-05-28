/**
 * Markdown renderer for code_health results.
 *
 * Renders structured health data from the code_health executor into
 * readable markdown sections keyed by `include` value.
 */

import type { GitContext } from "../../git-context.ts";
import { formatGitContext } from "../../git-context.ts";

export interface HealthServerInfo {
  name: string;
  root: string;
  fileTypes: string[];
  status: string;
}

export interface HealthDiagnosticEntry {
  file: string;
  errors: number;
  warnings: number;
}

export interface HealthData {
  lspAvailable: boolean;
  lspStatus: string;
  recovered: boolean;
  diagnostics: HealthDiagnosticEntry[];
  servers: HealthServerInfo[];
  gitContext: GitContext | null;
  scopeFilter: string | null;
  level: "summary" | "detailed";
}

export function renderHealthResult(data: HealthData, cwd: string): string {
  const lines: string[] = ["## Code Health", ""];

  renderStatusLine(lines, data);
  renderDiagnosticsSection(lines, data, cwd);
  renderServersSection(lines, data);
  renderDirtySection(lines, data);

  return lines.join("\n");
}

function renderStatusLine(lines: string[], data: HealthData): void {
  lines.push(`**LSP**: ${data.lspStatus}`);
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

function renderServersSection(lines: string[], data: HealthData): void {
  if (data.servers.length === 0) return;

  lines.push("### Servers");
  lines.push("");
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
