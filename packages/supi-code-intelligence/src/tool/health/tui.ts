/**
 * TUI renderer for code_health — renderCall + renderResult.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import {
  type EvidenceEntry,
  formatCallValue,
  formatEvidenceEntry,
  type ResultOptios,
  renderDomainError,
  renderDomainResult,
  renderEvidenceLines,
  renderExecutionError,
  renderMarkdownDetail,
  renderPartial,
  renderToolDisplaySections,
  renderTruncationDisclosure,
  type ToolRendererContext,
  type ToolResult,
} from "../../ui/tui/common.ts";
import type { CodeHealthToolParams } from "./execute.ts";
import { formatSemanticHealthState, readSemanticHealthState } from "./semantic-state.ts";

/** ── renderCall ────────────────────────────────────────────────── */

export function renderHealthCall(
  args: unknown,
  theme: Theme,
  _context: ToolRendererContext | undefined,
): Text {
  const params = (args ?? {}) as Partial<CodeHealthToolParams>;
  const sections =
    params.include === undefined
      ? "diag, servers"
      : Array.isArray(params.include) && params.include.length > 0
        ? params.include.map((section) => formatCallValue(section, 20) ?? "?").join(", ")
        : "none";

  let content = theme.fg("toolTitle", "code_health");
  content += ` ${theme.fg("accent", sections)}`;

  const scope = formatCallValue(params.scope);
  if (scope) content += ` ${theme.fg("dim", scope)}`;

  return new Text(content, 0, 0);
}

/** ── renderResult ──────────────────────────────────────────────── */

export function renderHealthResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  context: ToolRendererContext | undefined,
): Container | Text {
  if (options.isPartial) return renderPartial("Gathering workspace health…", theme);

  const data =
    result.details?.type === "health" ? (result.details.data as Record<string, unknown>) : null;
  const executionError = renderExecutionError(context, "code_health failed", theme);
  if (executionError) return executionError;
  const domainError = renderDomainError(result, theme);
  if (domainError) return renderDomainResult(result, options, theme, domainError);

  if (!options.expanded) {
    const compact = buildCompactSummary(data, theme);
    const truncation = renderTruncationDisclosure(result, theme);
    if (!truncation) return compact;
    const compactContainer = new Container();
    compactContainer.addChild(compact);
    compactContainer.addChild(new Spacer(1));
    compactContainer.addChild(truncation);
    return compactContainer;
  }

  const container = new Container();
  container.addChild(buildStatusBar(data, theme));
  const capabilityWarnings = readCapabilityWarnings(data);
  if (capabilityWarnings.length > 0) {
    container.addChild(new Spacer(1));
    container.addChild(buildCapabilityWarnings(capabilityWarnings, theme));
  }
  container.addChild(new Spacer(1));
  container.addChild(buildDiagnosticSummary(data, theme));
  renderToolDisplaySections(container, result.details?.displaySections, theme);
  container.addChild(buildHealthSectionSummary(data, theme));

  const lists = data?.evidenceLists as EvidenceEntry[] | undefined;
  if (lists && lists.length > 0) {
    container.addChild(new Spacer(1));
    renderEvidenceLines(container, lists, theme);
  }

  const truncation = renderTruncationDisclosure(result, theme);
  if (truncation) {
    container.addChild(new Spacer(1));
    container.addChild(truncation);
  }
  renderMarkdownDetail(container, result, theme);

  return container;
}

/** ── Helpers ───────────────────────────────────────────────────── */

interface HealthSectionSummary {
  key: string;
  status: "complete" | "partial" | "unavailable";
  itemCount: number;
  available: boolean;
}

function buildCompactSummary(data: Record<string, unknown> | null, theme: Theme): Text {
  const sections = readHealthSections(data);
  if (sections.length === 0) {
    return new Text(theme.fg("dim", "No health data"), 0, 0);
  }

  const semanticRequested = sections.some(
    (section) => section.key === "diagnostics" || section.key === "servers",
  );
  const segments = sections.map((section) => formatSectionSummary(section, undefined, theme));
  if (semanticRequested) {
    const semanticStatus = readSemanticStatus(data);
    const statusColor = semanticStatus.startsWith("ready") ? "success" : "warning";
    segments.push(`${theme.fg("dim", "lsp")} ${theme.fg(statusColor, semanticStatus)}`);
  }
  const capabilityWarningCount = readCapabilityWarnings(data).length;
  if (capabilityWarningCount > 0) {
    const label = capabilityWarningCount === 1 ? "capability warning" : "capability warnings";
    segments.push(theme.fg("warning", `${capabilityWarningCount} ${label}`));
  }

  const dot = theme.fg("dim", "·");
  return new Text(segments.join(` ${dot} `), 0, 0);
}

function formatSectionSummary(
  section: HealthSectionSummary,
  evidence: EvidenceEntry | undefined,
  theme: Theme,
): string {
  const label = sectionLabel(section.key);
  if (section.status === "unavailable" || !section.available) {
    return `${theme.fg("dim", label)} ${theme.fg("warning", "unavailable")}`;
  }
  if (section.status === "partial") {
    return `${theme.fg("dim", label)} ${theme.fg("warning", "partial")}`;
  }
  if (evidence) return theme.fg("success", theme.bold(formatEvidenceEntry(evidence)));

  const suffix = section.key === "diagnostics" ? " with issues" : "";
  return `${theme.fg("dim", label)} ${theme.fg("success", theme.bold(`${section.itemCount}`))}${theme.fg("muted", suffix)}`;
}

function buildStatusBar(data: Record<string, unknown> | null, theme: Theme): Text {
  const sections = readHealthSections(data);
  const semanticRequested = sections.some(
    (section) => section.key === "diagnostics" || section.key === "servers",
  );
  if (!data || !semanticRequested) return new Text("", 0, 0);

  const semanticStatus = readSemanticStatus(data);
  const structuralStatus = readString(data, "structuralStatus");
  const refreshStatus = readRefreshStatus(data);

  const lspColor = semanticStatus.startsWith("ready") ? "success" : "warning";
  const structuralColor = structuralStatus === "ready" ? "success" : "muted";

  const lines: string[] = [`LSP: ${theme.fg(lspColor, semanticStatus)}`];
  if (structuralStatus) {
    lines.push(`Tree-sitter: ${theme.fg(structuralColor, structuralStatus)}`);
  }
  if (refreshStatus) lines.push(`Diagnostics: ${theme.fg("dim", refreshStatus)}`);

  return new Text(lines.join("  "), 0, 0);
}

function readRefreshStatus(data: Record<string, unknown> | null): string | null {
  const refresh = readRecord(data?.refresh);
  if (!refresh) return null;

  switch (refresh.kind) {
    case "completed": {
      const attempted = readNumber(refresh.attemptedActiveClients);
      const restarted = readNumber(refresh.restartedClients);
      const stale = readRecord(refresh.staleAssessment);
      const noOp = attempted === 0 && restarted === 0;
      const base = noOp
        ? "refresh attempt completed no-op"
        : `refresh attempt completed: ${attempted} clients targeted, ${restarted} restarted`;
      return stale?.suspected === true
        ? `${base}; stale pattern suspected in ${readNumber(stale.matchedFileCount)} files`
        : base;
    }
    case "failed":
      return `refresh attempt failed${typeof refresh.reason === "string" ? `: ${refresh.reason}` : ""}`;
    case "not-attempted":
      return "refresh attempt not started";
    default:
      return null;
  }
}

function diagnosticEmptySummary(data: Record<string, unknown> | null): string {
  return diagnosticScopeKind(data) === "file"
    ? "No errors or warnings for file"
    : "No reported issues in tracked files";
}

function diagnosticScopeKind(data: Record<string, unknown> | null): string | null {
  const observation = readRecord(data?.diagnosticObservation);
  const scope = readRecord(observation?.scope);
  return typeof scope?.kind === "string" ? scope.kind : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

interface RenderedCapabilityWarning {
  message: string;
  language?: string;
  detail?: string;
}

function buildCapabilityWarnings(
  warnings: readonly RenderedCapabilityWarning[],
  theme: Theme,
): Text {
  const lines = [theme.fg("warning", theme.bold("Capability Warnings"))];
  for (const warning of warnings) {
    const language = warning.language ? `[${warning.language}] ` : "";
    const detail = warning.detail ? ` — ${warning.detail}` : "";
    lines.push(`${theme.fg("warning", "⚠")} ${language}${warning.message}${detail}`);
  }
  return new Text(lines.join("\n"), 0, 0);
}

function readCapabilityWarnings(data: Record<string, unknown> | null): RenderedCapabilityWarning[] {
  const report = data?.capabilityWarnings;
  if (typeof report !== "object" || report === null) return [];
  const warnings = (report as Record<string, unknown>).warnings;
  if (!Array.isArray(warnings)) return [];
  return warnings.flatMap((warning) => {
    if (typeof warning !== "object" || warning === null) return [];
    const record = warning as Record<string, unknown>;
    if (typeof record.message !== "string") return [];
    return [
      {
        message: record.message,
        ...(typeof record.language === "string" ? { language: record.language } : {}),
        ...(typeof record.detail === "string" ? { detail: record.detail } : {}),
      },
    ];
  });
}

function buildHealthSectionSummary(data: Record<string, unknown> | null, theme: Theme): Text {
  const sections = readHealthSections(data).filter((section) => section.key !== "diagnostics");
  if (sections.length === 0) return new Text("", 0, 0);

  const lines = sections.map((section) => {
    const label = section.key === "servers" ? "servers (workspace)" : sectionLabel(section.key);
    if (section.status === "unavailable" || !section.available) {
      return `${label} unavailable`;
    }
    return `${label} ${section.itemCount}`;
  });
  return new Text(theme.fg("muted", lines.join("  ")), 0, 0);
}

function buildDiagnosticSummary(data: Record<string, unknown> | null, theme: Theme): Text {
  const section = readHealthSections(data).find((entry) => entry.key === "diagnostics");
  if (!section) return new Text("", 0, 0);
  if (section.status === "unavailable" || !section.available) {
    return new Text(theme.fg("warning", "Diagnostics unavailable"), 0, 0);
  }
  const trackedFiles = diagnosticScopeKind(data) === "tracked-files";
  if (section.status === "partial") {
    return new Text(
      theme.fg(
        "warning",
        trackedFiles ? "Tracked-file diagnostics partial" : "Diagnostics partial",
      ),
      0,
      0,
    );
  }
  if (section.itemCount === 0) {
    return new Text(theme.fg("success", diagnosticEmptySummary(data)), 0, 0);
  }

  const fileLabel = `${trackedFiles ? "tracked " : ""}${section.itemCount === 1 ? "file" : "files"}`;
  return new Text(
    theme.fg("warning", theme.bold(`${section.itemCount} ${fileLabel} with issues`)),
    0,
    0,
  );
}

function readHealthSections(data: Record<string, unknown> | null): HealthSectionSummary[] {
  const value = data?.sections;
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const rawKey = typeof record.key === "string" ? record.key : "";
    const key = rawKey.startsWith("health.") ? rawKey.slice("health.".length) : rawKey;
    if (!key) return [];
    return [
      {
        key,
        status: isSectionStatus(record.status) ? record.status : "unavailable",
        itemCount: typeof record.itemCount === "number" ? record.itemCount : 0,
        available: record.available === true,
      },
    ];
  });
}

function isSectionStatus(value: unknown): value is HealthSectionSummary["status"] {
  return value === "complete" || value === "partial" || value === "unavailable";
}

function readSemanticStatus(data: Record<string, unknown> | null): string {
  return formatSemanticHealthState(readSemanticHealthState(data?.semanticState));
}

function readString(data: Record<string, unknown> | null, key: string): string | null {
  const value = data?.[key];
  return typeof value === "string" ? value : null;
}

const SECTION_LABELS: Record<string, string> = {
  diagnostics: "diag",
  servers: "servers",
};

function sectionLabel(key: string): string {
  return SECTION_LABELS[key] ?? key;
}
