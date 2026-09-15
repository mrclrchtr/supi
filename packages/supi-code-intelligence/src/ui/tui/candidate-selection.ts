/** Shared human transcript renderer for target-candidate selections. */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Component, Container, Spacer, Text } from "@earendil-works/pi-tui";
import { formatCandidateRow } from "../../tool/result/candidate-row.ts";
import {
  MAX_TUI_DISPLAY_ITEMS,
  readToolDisplaySections,
  truncateDisplayText,
} from "../../tool/result/display.ts";
import type { ToolDisplaySection } from "../../tool/result/types.ts";
import { createLegacyCandidateBody, readLegacyCandidateText } from "./candidate-legacy-body.ts";
import {
  type EvidenceEntry,
  formatEvidenceEntry,
  type ResultOptios,
  readEvidenceEntries,
  renderTruncationDisclosure,
  type ToolResult,
} from "./common.ts";

/** Display-section keys that identify candidate-selection results. */
export type CandidateSelectionKey =
  | "graph.candidates"
  | "resolve.candidates"
  | "orientation.candidates";

interface CandidateRow {
  targetId: string;
  name: string;
  kind: string | null;
  file: string;
  line: number;
  character: number;
  rank: number;
  container: string | null;
}

interface CandidateSelectionData {
  reason: string | null;
  evidence: EvidenceEntry | null;
  display: ToolDisplaySection | null;
  rows: string[];
  guidance: string[];
  legacyGuidance: string[];
  legacyMarkdownText: string;
  rawFallback: boolean;
}

/** Render a candidate-selection result, or return null for unrelated results. */
export function renderCandidateSelection(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  key: CandidateSelectionKey,
): Component | null {
  const selection = readCandidateSelection(result, key);
  if (!selection) return null;
  return new CandidateSelectionComponent(result, options, theme, selection);
}

function readCandidateSelection(
  result: ToolResult,
  key: CandidateSelectionKey,
): CandidateSelectionData | null {
  const data = asRecord(result.details?.data);
  const legacyMarkdownText = readLegacyCandidateText(result.content);
  const display =
    readToolDisplaySections(result.details?.displaySections).find(
      (section) => section.key === key,
    ) ?? null;
  const evidence =
    readEvidenceEntries(data?.evidenceLists).find((entry) => entry.key === key) ?? null;
  const structuredCandidates = readCandidateRows(data?.candidates);

  // A status or message alone is not a candidate-selection marker. Require a
  // candidate key or a structured candidate collection before changing views.
  if (!display && !evidence && !structuredCandidates) return null;

  const rows = candidateRowsFor(display, structuredCandidates, key);
  const selectionEvidence = candidateEvidenceFor({
    display,
    evidence,
    structuredCandidates,
    rows,
    key,
  });
  const reason = selectionReason(result, data);
  const structuredGuidance = readStructuredNextQueries(data);
  const guidance = selectionGuidance(result, data, key);

  return {
    reason,
    evidence: selectionEvidence,
    display,
    rows,
    guidance,
    legacyGuidance: key === "orientation.candidates" ? structuredGuidance.slice(0, 2) : [],
    legacyMarkdownText,
    rawFallback:
      rows.length === 0 ||
      !hasStructuredSelectionReason(result, data) ||
      !hasStructuredSelectionGuidance(data),
  };
}

function candidateRowsFor(
  display: ToolDisplaySection | null,
  structuredCandidates: CandidateRow[] | null,
  key: CandidateSelectionKey,
): string[] {
  if (display?.lines.length) return [...display.lines];
  return (structuredCandidates ?? []).map((candidate, index) =>
    formatCandidateRow(
      candidate,
      key === "graph.candidates" ? "handle-first" : "rank-first",
      index + 1,
    ),
  );
}

function candidateEvidenceFor(input: {
  display: ToolDisplaySection | null;
  evidence: EvidenceEntry | null;
  structuredCandidates: CandidateRow[] | null;
  rows: string[];
  key: CandidateSelectionKey;
}): EvidenceEntry | null {
  if (input.display?.lines.length) return displayEvidence(input.display, input.key);
  if (input.evidence && input.structuredCandidates?.length) {
    return evidenceForRows(input.evidence, input.rows.length);
  }
  if (input.display) return displayEvidence(input.display, input.key);
  return input.evidence;
}

function displayEvidence(display: ToolDisplaySection, key: CandidateSelectionKey): EvidenceEntry {
  const shownCount = display.lines.length;
  return {
    key,
    shownCount,
    totalCount: display.totalCount,
    omittedCount:
      display.totalCount === null
        ? unknownOmittedCount(display.omittedCount, Math.max(0, display.shownCount - shownCount))
        : Math.max(0, display.totalCount - shownCount),
    partialReason: display.partialReason,
  };
}

function evidenceForRows(evidence: EvidenceEntry, shownCount: number): EvidenceEntry {
  return {
    ...evidence,
    shownCount,
    omittedCount:
      evidence.totalCount === null
        ? unknownOmittedCount(evidence.omittedCount, Math.max(0, evidence.shownCount - shownCount))
        : Math.max(0, evidence.totalCount - shownCount),
  };
}

function readCandidateRows(value: unknown): CandidateRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.slice(0, MAX_TUI_DISPLAY_ITEMS).map(readCandidateRow);
  return rows.every((row): row is CandidateRow => row !== null) ? rows : null;
}

function readCandidateRow(value: unknown): CandidateRow | null {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.targetId !== "string" ||
    record.targetId.length === 0 ||
    typeof record.name !== "string" ||
    typeof record.file !== "string" ||
    !isPosition(record.line) ||
    !isPosition(record.character) ||
    (record.rank !== undefined && !isCount(record.rank)) ||
    (record.kind !== undefined && !isNullableString(record.kind)) ||
    (record.container !== undefined && !isNullableString(record.container))
  ) {
    return null;
  }
  return {
    targetId: record.targetId,
    name: record.name,
    kind: typeof record.kind === "string" ? record.kind : null,
    file: record.file,
    line: record.line,
    character: record.character,
    rank: isCount(record.rank) ? record.rank : 0,
    container: typeof record.container === "string" ? record.container : null,
  };
}

function selectionReason(result: ToolResult, data: Record<string, unknown> | null): string | null {
  const message = typeof result.details?.message === "string" ? result.details.message.trim() : "";
  if (message) return truncateDisplayText(message, 160);

  const resultKind = data?.resultKind;
  if (resultKind === "kind-mismatch" && typeof data?.requestedKind === "string") {
    return `No target matched provider kind ${data.requestedKind}.`;
  }
  if (resultKind === "disambiguation") return "Multiple target matches require one candidate.";
  return null;
}

function hasStructuredSelectionReason(
  result: ToolResult,
  data: Record<string, unknown> | null,
): boolean {
  const message = typeof result.details?.message === "string" && result.details.message.trim();
  if (message) return true;
  return (
    data?.resultKind === "disambiguation" ||
    (data?.resultKind === "kind-mismatch" && typeof data.requestedKind === "string")
  );
}

function hasStructuredSelectionGuidance(data: Record<string, unknown> | null): boolean {
  return readStructuredNextQueries(data).length > 0;
}

function readStructuredNextQueries(data: Record<string, unknown> | null): string[] {
  return Array.isArray(data?.nextQueries)
    ? data.nextQueries.filter(
        (query): query is string => typeof query === "string" && query.length > 0,
      )
    : [];
}

function selectionGuidance(
  result: ToolResult,
  data: Record<string, unknown> | null,
  key: CandidateSelectionKey,
): string[] {
  const nextQueries = readStructuredNextQueries(data);
  if (nextQueries.length > 0) return nextQueries.slice(0, 2);

  const mismatch =
    data?.resultKind === "kind-mismatch" || result.details?.status === "invalid-input";
  if (key === "orientation.candidates") {
    return ["Use one candidate handle as focus.target.handle"];
  }
  if (mismatch) {
    return [
      "Retry without symbolKind, use an observed provider kind, or choose a candidate handle",
    ];
  }
  return ["Choose one candidate handle, or narrow the symbol selector with scope or symbolKind"];
}

class CandidateSelectionComponent implements Component {
  constructor(
    private readonly result: ToolResult,
    private readonly options: ResultOptios,
    private readonly theme: Theme,
    private readonly selection: CandidateSelectionData,
  ) {}

  render(width: number): string[] {
    const container = new Container();
    const reason = this.selection.reason ? `: ${this.selection.reason}` : "";
    container.addChild(new Text(this.theme.fg("warning", `Choose a target${reason}`), 0, 0));

    if (!this.options.expanded) return this.renderCollapsed(container, width);
    if (this.appendLegacyFallback(container)) return this.renderContainer(container, width);

    this.appendStructuredSelection(container);
    this.appendTruncation(container);
    return this.renderContainer(container, width);
  }

  invalidate(): void {}

  private renderCollapsed(container: Container, width: number): string[] {
    const summary = this.selection.evidence ? formatEvidenceEntry(this.selection.evidence) : null;
    if (summary) container.addChild(new Text(this.theme.fg("muted", summary), 0, 0));
    this.appendTruncation(container);
    return this.renderContainer(container, width);
  }

  private appendLegacyFallback(container: Container): boolean {
    if (!this.selection.rawFallback || !this.selection.legacyMarkdownText.trim()) return false;
    const legacyBody = createLegacyCandidateBody(this.selection.legacyMarkdownText, this.theme);
    if (!legacyBody) return false;

    const divider = `${this.theme.fg("border", "────")} ${this.theme.fg("dim", "raw markdown")} ${this.theme.fg("border", "────")}`;
    container.addChild(new Spacer(1));
    container.addChild(new Text(divider, 0, 0));
    container.addChild(legacyBody);
    this.appendLegacyGuidance(container);
    this.appendTruncation(container);
    return true;
  }

  private appendLegacyGuidance(container: Container): void {
    if (this.selection.legacyGuidance.length === 0) return;
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(this.theme.fg("muted", `next: ${this.selection.legacyGuidance.join(" · ")}`), 0, 0),
    );
  }

  private appendStructuredSelection(container: Container): void {
    container.addChild(new Spacer(1));
    const title = this.selection.display?.title ?? "Candidates";
    const bounds = this.selection.evidence ? formatSectionBounds(this.selection.evidence) : "";
    container.addChild(
      new Text(this.theme.fg("dim", `${title}${bounds ? ` (${bounds})` : ""}`), 0, 0),
    );
    for (const row of this.selection.rows) {
      container.addChild(new Text(this.theme.fg("muted", row), 0, 0));
    }

    if (this.selection.guidance.length === 0) return;
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(this.theme.fg("muted", `next: ${this.selection.guidance.join(" · ")}`), 0, 0),
    );
  }

  private renderContainer(container: Container, width: number): string[] {
    return container.render(Math.max(1, width));
  }

  private appendTruncation(container: Container): void {
    const truncation = renderTruncationDisclosure(this.result, this.theme);
    if (!truncation) return;
    container.addChild(new Spacer(1));
    container.addChild(truncation);
  }
}

function formatSectionBounds(entry: EvidenceEntry): string {
  if (entry.totalCount === null) {
    const omitted = entry.omittedCount ? `; ${entry.omittedCount} collected omitted` : "";
    const reason = entry.partialReason ? `; more may exist — ${entry.partialReason}` : "; partial";
    return `${entry.shownCount}${omitted}${reason}`;
  }
  if (entry.omittedCount)
    return `${entry.shownCount} of ${entry.totalCount}; ${entry.omittedCount} omitted`;
  return `${entry.totalCount}`;
}

function unknownOmittedCount(base: number | null, additional: number): number | null {
  const omitted = (base ?? 0) + additional;
  return omitted > 0 ? omitted : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isPosition(value: unknown): value is number {
  return isCount(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
