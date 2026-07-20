/**
 * TUI renderer for code_health — renderCall + renderResult.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import {
  type EvidenceEntry,
  formatEvidenceEntry,
  type ResultOptios,
  readEvidenceEntries,
  renderEvidenceLines,
  renderMarkdownDetail,
  renderPartial,
  type ToolResult,
} from "../../ui/tui/common.ts";
import type { CodeHealthToolParams } from "./execute.ts";
import { formatSemanticHealthState, readSemanticHealthState } from "./semantic-state.ts";

/** ── renderCall ────────────────────────────────────────────────── */

export function renderHealthCall(args: unknown, theme: Theme, _context: unknown): Text {
  const params = (args ?? {}) as CodeHealthToolParams;
  const sections =
    params.include === undefined
      ? "diag, servers"
      : params.include.length > 0
        ? params.include.join(", ")
        : "none";

  let content = theme.fg("toolTitle", "code_health");
  content += ` ${theme.fg("accent", sections)}`;

  if (params.scope) {
    content += ` ${theme.fg("dim", params.scope)}`;
  }

  return new Text(content, 0, 0);
}

/** ── renderResult ──────────────────────────────────────────────── */

export function renderHealthResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  _context: unknown,
): Container | Text {
  if (options.isPartial) {
    return renderPartial("Gathering workspace health…", theme);
  }

  const container = new Container();
  const data =
    result.details?.type === "health" ? (result.details.data as Record<string, unknown>) : null;

  if (result.isError) {
    container.addChild(new Text(theme.fg("error", "code_health failed"), 0, 0));
    return container;
  }

  if (!options.expanded) {
    container.addChild(buildCompactSummary(data, theme));
    return container;
  }

  // Expanded view
  container.addChild(buildStatusBar(data, theme));
  container.addChild(new Spacer(1));
  container.addChild(buildDiagnosticSummary(data, theme));
  container.addChild(buildHealthSectionSummary(data, theme));

  const lists = data?.evidenceLists as EvidenceEntry[] | undefined;
  if (lists && lists.length > 0) {
    container.addChild(new Spacer(1));
    renderEvidenceLines(container, lists, theme);
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
  locator?: string;
}

function buildCompactSummary(data: Record<string, unknown> | null, theme: Theme): Text {
  const sections = readHealthSections(data);
  if (sections.length === 0) {
    return new Text(theme.fg("dim", "No health data"), 0, 0);
  }

  const evidence = readEvidenceEntries(data?.evidenceLists);
  const usedEvidence = new Set<EvidenceEntry>();
  const semanticRequested = sections.some(
    (section) => section.key === "diagnostics" || section.key === "servers",
  );
  const segments = sections.map((section) => {
    const sectionEvidence = evidenceForSection(section, evidence);
    if (sectionEvidence) usedEvidence.add(sectionEvidence);
    return formatSectionSummary(section, sectionEvidence, theme);
  });
  for (const entry of evidence) {
    if (usedEvidence.has(entry)) continue;
    segments.push(theme.fg("success", theme.bold(formatEvidenceEntry(entry))));
  }
  if (semanticRequested) {
    const semanticStatus = readSemanticStatus(data);
    const statusColor = semanticStatus.startsWith("ready") ? "success" : "warning";
    segments.push(`${theme.fg("dim", "lsp")} ${theme.fg(statusColor, semanticStatus)}`);
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
  const recovered = data.recovered === true;

  const lspColor = semanticStatus.startsWith("ready") ? "success" : "warning";
  const structuralColor = structuralStatus === "ready" ? "success" : "muted";

  const lspLabel =
    semanticStatus.includes("(recovered)") || !recovered
      ? semanticStatus
      : `${semanticStatus} (recovered)`;

  const lines: string[] = [`LSP: ${theme.fg(lspColor, lspLabel)}`];
  if (structuralStatus) {
    lines.push(`Tree-sitter: ${theme.fg(structuralColor, structuralStatus)}`);
  }

  return new Text(lines.join("  "), 0, 0);
}

function buildHealthSectionSummary(data: Record<string, unknown> | null, theme: Theme): Text {
  const sections = readHealthSections(data).filter((section) => section.key !== "diagnostics");
  if (sections.length === 0) return new Text("", 0, 0);

  const lines = sections.map((section) => {
    const label = sectionLabel(section.key);
    if (section.status === "unavailable" || !section.available) {
      const locator = section.locator ? ` at ${section.locator}` : "";
      return `${label} unavailable${locator}`;
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
  if (section.itemCount === 0) {
    return new Text(theme.fg("success", "No diagnostics found"), 0, 0);
  }

  const fileLabel = section.itemCount === 1 ? "file" : "files";
  return new Text(
    theme.fg("warning", theme.bold(`${section.itemCount} ${fileLabel} with issues`)),
    0,
    0,
  );
}

function evidenceForSection(
  section: HealthSectionSummary,
  evidence: readonly EvidenceEntry[],
): EvidenceEntry | undefined {
  if (section.key !== "dirty") return undefined;
  return evidence.find((entry) => entry.key === "health.dirtyFiles");
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
        ...(typeof record.locator === "string" ? { locator: record.locator } : {}),
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
  dirty: "dirty",
  coverage: "coverage",
  unused: "unused",
};

function sectionLabel(key: string): string {
  return SECTION_LABELS[key] ?? key;
}
