/**
 * Markdown renderer for code_health results.
 *
 * Renders structured health data from the code_health executor into
 * readable markdown sections keyed by requested `include` values.
 */

import type { GitContext } from "../../git-context.ts";
import { formatGitContext } from "../../git-context.ts";

export type HealthSection = "diagnostics" | "servers" | "dirty" | "coverage" | "unused";

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

export interface HealthCoverageEntry {
  file: string;
  pct: number;
}

export interface HealthCoverageData {
  available: boolean;
  entries: HealthCoverageEntry[];
}

export interface HealthUnusedExportEntry {
  file: string;
  name: string;
}

export interface HealthUnusedData {
  available: boolean;
  files: string[];
  exports: HealthUnusedExportEntry[];
}

/** A suggested code action at a specific diagnostic location. */
export interface CodeActionSuggestion {
  file: string;
  line: number;
  title: string;
  kind?: string;
}

export interface HealthData {
  includedSections: HealthSection[];
  lspAvailable: boolean;
  lspStatus: string;
  recovered: boolean;
  diagnostics: HealthDiagnosticEntry[];
  servers: HealthServerInfo[];
  gitContext: GitContext | null;
  scopeFilter: string | null;
  level: "summary" | "detailed";
  /** Code action suggestions collected from LSP (only populated in detailed mode). */
  codeActions: CodeActionSuggestion[] | null;
  coverage: HealthCoverageData | null;
  unused: HealthUnusedData | null;
}

export function renderHealthResult(data: HealthData, cwd: string): string {
  const lines: string[] = ["## Code Health", ""];

  renderStatusLine(lines, data);

  if (data.includedSections.includes("diagnostics")) {
    renderDiagnosticsSection(lines, data, cwd);
  }
  if (data.includedSections.includes("coverage")) {
    renderCoverageSection(lines, data, cwd);
  }
  if (data.includedSections.includes("unused")) {
    renderUnusedSection(lines, data, cwd);
  }
  if (data.includedSections.includes("servers")) {
    renderServersSection(lines, data);
  }
  if (data.includedSections.includes("dirty")) {
    renderDirtySection(lines, data);
  }

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
  if (!data.codeActions || data.codeActions.length === 0) return;

  if (data.level === "summary") {
    const count = data.codeActions.length;
    lines.push(
      `_${count} suggested fix${count !== 1 ? "es" : ""} available. Use \`level: "detailed"\` to see them._`,
    );
    return;
  }

  lines.push("");
  lines.push("### Code Actions");
  lines.push("");
  lines.push("Available fixes (suggestions only — not applied):");
  lines.push("");
  for (const action of data.codeActions) {
    const relPath = makeRelative(cwd, action.file);
    const kindLabel = action.kind ? ` (${action.kind})` : "";
    lines.push(`- \`${relPath}:${action.line}\` — "${action.title}"${kindLabel}`);
  }
}

function renderCoverageSection(lines: string[], data: HealthData, cwd: string): void {
  lines.push("### Coverage");
  lines.push("");

  if (!data.coverage?.available) {
    lines.push("No coverage report found.");
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
    lines.push("No unused report found.");
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
