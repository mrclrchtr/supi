/** Human transcript renderer for code_graph. */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Component, Container, Spacer, Text } from "@earendil-works/pi-tui";
import { renderCandidateSelection } from "../../ui/tui/candidate-selection.ts";
import {
  buildSimpleCompact,
  type EvidenceEntry,
  formatCallPath,
  formatCallValue,
  type ResultOptios,
  readEvidenceEntries,
  renderDomainError,
  renderExecutionError,
  renderMarkdownDetail,
  renderPartial,
  renderToolDisplaySections,
  renderTruncationDisclosure,
  type ToolRendererContext,
  type ToolResult,
} from "../../ui/tui/common.ts";
import {
  MAX_TUI_DISPLAY_ITEMS,
  readToolDisplaySections,
  truncateDisplayText,
} from "../result/display.ts";
import type { ToolDisplaySection } from "../result/types.ts";
import type { GraphFileGroup } from "./details.ts";
import type { CodeGraphToolParams, GraphRelation } from "./execute.ts";
import { compactGraphLabel, formatGraphEvidence, formatGraphRange } from "./format.ts";

/** Render the compact call header from the requested selector. */
export function renderGraphCall(
  args: unknown,
  theme: Theme,
  _context: ToolRendererContext | undefined,
): Text {
  const params = (args ?? {}) as Partial<CodeGraphToolParams>;
  const relations: GraphRelation[] = Array.isArray(params.relations)
    ? params.relations
    : ["references"];
  const label = formatRelations(relations);
  const target = formatTarget(params.target);
  return new Text(
    theme.fg("toolTitle", "code_graph") +
      (label ? ` ${theme.fg("accent", label)}` : "") +
      (target ? ` ${theme.fg("muted", target)}` : ""),
    0,
    0,
  );
}

/** Render one structured body, with no duplicate agent Markdown. */
export function renderGraphResult(
  result: ToolResult,
  options: ResultOptios,
  theme: Theme,
  context: ToolRendererContext | undefined,
): Component {
  if (options.isPartial) return renderPartial("Collecting relations…", theme);
  const executionError = renderExecutionError(
    result,
    { isError: context?.isError, expanded: options.expanded, label: "code_graph failed" },
    theme,
  );
  if (executionError) return executionError;
  const candidateSelection = renderCandidateSelection(result, options, theme, "graph.candidates");
  if (candidateSelection) return candidateSelection;
  const domainError = renderDomainError(result, theme);
  if (domainError) return renderGraphDomainError(result, options.expanded, domainError, theme);

  const data = asRecord(result.details?.data);
  const container = new Container();
  if (result.details?.type === "graph" && data) {
    renderGraphBody(data, result, { container, expanded: options.expanded, theme });
  } else {
    // Older persisted results have only generic search details.
    container.addChild(buildSimpleCompact(data ?? undefined, theme));
    if (options.expanded)
      renderToolDisplaySections(container, result.details?.displaySections, theme);
  }
  const truncation = renderTruncationDisclosure(result, theme);
  if (truncation) {
    container.addChild(new Spacer(1));
    container.addChild(truncation);
  }
  return container;
}

interface SectionView {
  rel: string;
  label: string;
  unavailable: boolean;
  message: string | null;
  externalCount: number;
  scope: Record<string, unknown> | null;
  fileGroups: GraphFileGroup[];
}

function renderGraphBody(
  data: Record<string, unknown>,
  result: ToolResult,
  options: { container: Container; expanded: boolean; theme: Theme },
): void {
  const { container, expanded, theme } = options;
  const target =
    typeof data.targetName === "string" ? compactGraphLabel(data.targetName) : "Target";
  const file = typeof data.targetFile === "string" ? truncateDisplayText(data.targetFile) : "";
  container.addChild(new Text(theme.fg("accent", `${target}${file ? ` — ${file}` : ""}`), 0, 0));
  const evidence = readEvidenceEntries(data.evidenceLists);
  const displays = readToolDisplaySections(result.details?.displaySections);
  const sections = readSections(data.sections);
  const summaries: string[] = [];
  for (const section of sections) {
    const display = displays.find((entry) => entry.key === `graph.${section.rel}`);
    const metadata = evidence.find((entry) => entry.key.startsWith(`${section.rel}.`));
    const summary = sectionSummary(section, metadata, display);
    if (!expanded) {
      summaries.push(summary);
      continue;
    }
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(theme.fg(section.unavailable ? "warning" : "accent", summary), 0, 0),
    );
    renderRelationBody(container, { section, display, targetName: data.targetName }, theme);
  }
  if (!expanded)
    container.addChild(
      new Text(theme.fg("muted", summaries.join(" · ") || "No graph sections"), 0, 0),
    );
}

function renderRelationBody(
  container: Container,
  input: { section: SectionView; display: ToolDisplaySection | undefined; targetName: unknown },
  theme: Theme,
): void {
  const { section, display, targetName } = input;
  if (section.unavailable) {
    if (section.message)
      container.addChild(new Text(theme.fg("warning", truncateDisplayText(section.message)), 0, 0));
    return;
  }
  const scope = scopeLabel(section.scope, targetName);
  if (scope) container.addChild(new Text(theme.fg("dim", scope), 0, 0));
  const rows = display?.lines ?? [];
  let index = 0;
  const groups =
    section.fileGroups.reduce((sum, group) => sum + group.count, 0) === rows.length
      ? section.fileGroups
      : [];
  for (const group of groups) {
    if (index >= rows.length) break;
    container.addChild(new Text(theme.fg("dim", group.file), 0, 0));
    for (const row of rows.slice(index, index + group.count))
      container.addChild(new Text(theme.fg("muted", `  ${row}`), 0, 0));
    index += group.count;
  }
  // Older results contain full paths in each row and have no file groups.
  for (const row of rows.slice(index)) container.addChild(new Text(theme.fg("muted", row), 0, 0));
}

function renderGraphDomainError(
  result: ToolResult,
  expanded: boolean,
  domainError: Text,
  theme: Theme,
): Container | Text {
  if (!expanded) return domainError;
  const container = new Container();
  container.addChild(domainError);
  const displays = readToolDisplaySections(result.details?.displaySections);
  renderToolDisplaySections(container, displays, theme);
  if (displays.length === 0) renderMarkdownDetail(container, result, theme);
  return container;
}

function sectionSummary(
  section: SectionView,
  metadata: EvidenceEntry | undefined,
  display: ToolDisplaySection | undefined,
): string {
  if (section.unavailable) return `${section.label}: unavailable`;
  if (!metadata) return `${section.label}: evidence unavailable`;
  // The display has its own bounded row count; the underlying evidence total is unchanged.
  const shown = display
    ? { ...metadata, shownCount: display.shownCount, omittedCount: display.omittedCount }
    : metadata;
  return `${section.label}: ${formatGraphEvidence(shown, section.rel === "callees" ? "call sites" : "locations", section.externalCount)}`;
}

function readSections(value: unknown): SectionView[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).flatMap((item) => {
    const section = asRecord(item);
    if (
      !section ||
      typeof section.rel !== "string" ||
      !["references", "callees", "implements"].includes(section.rel) ||
      (section.source !== "structural" && section.source !== "semantic")
    )
      return [];
    const rel = section.rel;
    const source = section.source;
    const depth =
      rel === "callees" && (section.depth === "direct" || section.depth === "deep")
        ? `, ${section.depth}`
        : "";
    return [
      {
        rel,
        label: `${rel} (${source}${depth})`,
        unavailable: section.status === "unavailable",
        message: typeof section.message === "string" ? section.message : null,
        externalCount: typeof section.externalCount === "number" ? section.externalCount : 0,
        scope: asRecord(section.enclosingScope),
        fileGroups: readFileGroups(section.fileGroups),
      },
    ];
  });
}

function readFileGroups(value: unknown): GraphFileGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: GraphFileGroup[] = [];
  for (const entry of value.slice(0, MAX_TUI_DISPLAY_ITEMS)) {
    const group = asRecord(entry);
    if (
      !group ||
      typeof group.file !== "string" ||
      typeof group.count !== "number" ||
      !Number.isInteger(group.count) ||
      group.count < 1 ||
      group.count > MAX_TUI_DISPLAY_ITEMS
    )
      return [];
    groups.push({ file: truncateDisplayText(group.file), count: group.count });
  }
  return groups;
}

function scopeLabel(scope: Record<string, unknown> | null, targetName: unknown): string | null {
  if (!scope || typeof scope.startLine !== "number" || typeof scope.endLine !== "number")
    return null;
  const name =
    typeof scope.name === "string" && scope.name !== targetName
      ? `${compactGraphLabel(scope.name)} — `
      : "";
  const range = formatGraphRange({ startLine: scope.startLine, endLine: scope.endLine });
  return `Scope: ${name}${range}; source expressions, not resolved symbols`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function formatRelations(relations: readonly GraphRelation[]): string {
  return relations.length ? `→ ${relations.slice(0, 3).join(", ")}` : "";
}

function formatTarget(target: unknown): string {
  const record = asRecord(target);
  if (!record) return "";
  const symbol = asRecord(record.symbol);
  if (symbol) {
    const query = formatCallValue(symbol.query);
    return query ? `of ${query}` : "";
  }
  const anchor = asRecord(record.anchor);
  if (anchor) {
    const file = formatCallPath(anchor.file);
    const line = typeof anchor.line === "number" ? `:${anchor.line}` : "";
    return file ? `at ${file}${line}` : "";
  }
  const handle = formatCallValue(record.handle);
  return handle ? `of ${handle}` : "";
}
