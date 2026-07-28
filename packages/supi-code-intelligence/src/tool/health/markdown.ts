/**
 * Markdown renderer for code_health results.
 *
 * Renders structured health data from the code_health executor into
 * readable markdown sections keyed by requested `include` values.
 */

import type { CapabilityWarningReport } from "../../analysis/capability/capability-warnings.ts";
import type { HealthData, HealthResultAssembly, HealthSection } from "../result/health.ts";
import { formatSemanticHealthState } from "./semantic-state.ts";

export type {
  HealthData,
  HealthSection,
  SemanticHealthState,
} from "../result/health.ts";

export function renderHealthResult(result: HealthResultAssembly, cwd: string): string {
  const data = result.data;
  const lines: string[] = ["## Code Health", ""];
  const hasSection = (key: HealthSection): boolean =>
    result.assembled.sections.some((section) => section.key === `health.${key}`);
  const semanticRequested = hasSection("diagnostics") || hasSection("servers");

  renderStatusLine(lines, data, semanticRequested);
  renderStalenessBanner(lines, data, sectionStatus(result, "diagnostics"));

  if (hasSection("diagnostics")) {
    renderDiagnosticsSection(lines, data, cwd, {
      status: sectionStatus(result, "diagnostics"),
    });
  }
  if (semanticRequested) {
    renderCapabilityWarningsSection(lines, result.details.capabilityWarnings);
  }
  if (hasSection("servers")) {
    renderServersSection(lines, data, sectionStatus(result, "servers"));
  }
  return lines.join("\n");
}

function renderStalenessBanner(
  lines: string[],
  data: HealthData,
  status: "complete" | "partial" | "unavailable" | undefined,
): void {
  if (status !== "complete" && status !== "partial") return;
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
    if (warning.detail) {
      lines.push(`  — ${warning.detail}`);
    }
  }
  lines.push("");
}

function renderStatusLine(lines: string[], data: HealthData, semanticRequested: boolean): void {
  if (!semanticRequested) return;

  lines.push(`**LSP**: ${displaySemanticStatus(data)}`);
  if (data.structuralStatus) {
    lines.push(`**Structural**: ${data.structuralStatus}`);
  }
  if (data.recovered) {
    lines.push("**Recovery**: diagnostics refreshed");
  }
  lines.push("");
}

interface DiagnosticRenderOptions {
  status: "complete" | "partial" | "unavailable" | undefined;
}

function renderDiagnosticsSection(
  lines: string[],
  data: HealthData,
  cwd: string,
  options: DiagnosticRenderOptions,
): void {
  lines.push("### Diagnostics");
  lines.push("");

  if (options.status === "unavailable") {
    lines.push(`Diagnostics unavailable — ${displaySemanticStatus(data)}.`);
  } else if (data.diagnostics.length === 0) {
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

function renderServersSection(
  lines: string[],
  data: HealthData,
  status: "complete" | "partial" | "unavailable" | undefined,
): void {
  lines.push("### Servers");
  lines.push("");

  if (status === "unavailable") {
    lines.push(`Server status unavailable — ${displaySemanticStatus(data)}.`);
    lines.push("");
    return;
  }
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

function displaySemanticStatus(data: HealthData): string {
  return formatSemanticHealthState(data.semanticState);
}

function sectionStatus(
  result: HealthResultAssembly,
  key: HealthSection,
): "complete" | "partial" | "unavailable" | undefined {
  return result.assembled.sections.find((section) => section.key === `health.${key}`)?.status;
}

function makeRelative(cwd: string, file: string): string {
  if (file.startsWith(cwd)) {
    return file.slice(cwd.length + 1);
  }
  return file;
}
