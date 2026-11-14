import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import {
  createEvidenceList,
  createPartialEvidenceList,
  describeEvidenceList,
  type EvidenceListMetadata,
} from "../../analysis/evidence.ts";
import type { ReadNextItem } from "../../analysis/read-next.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import type {
  OrientationCandidate,
  OrientationItem,
  OrientationResultData,
  OrientationSectionData,
} from "../../session/orientation-types.ts";
import type { TargetStoreEntry } from "../../session/target-store.ts";
import {
  assembledNextQueries,
  assembledReadNext,
  assembleToolResult,
  type ResultSection,
  type ToolResultAssembly,
} from "../result/assembly.ts";
import { assembleCandidateSelection } from "../result/candidate-selection.ts";
import {
  createToolDisplaySection,
  MAX_TUI_DISPLAY_ITEMS,
  truncateDisplayText,
} from "../result/display.ts";
import type {
  ContextDetails,
  OrientationSectionDetails,
  ToolDisplaySection,
} from "../result/types.ts";

export interface OrientationDetailsInput {
  readonly confidence: ConfidenceMode;
  readonly task?: string | null;
  readonly focusTarget?: string | null;
  readonly requestedSections?: readonly string[];
  readonly renderedSections?: readonly string[];
  readonly omittedCount?: number;
  readonly evidenceLists?: readonly EvidenceListMetadata[];
  readonly sections?: readonly OrientationSectionData[];
  readonly nextQueries: readonly string[];
  readonly readNext?: readonly ReadNextItem[];
  readonly target?: Readonly<TargetStoreEntry>;
  /** Current anchored focus observation; never read from the target store. */
  readonly resolution?: OrientationResultData["resolution"];
  readonly candidates?: readonly OrientationCandidate[];
  readonly instructions?: OrientationResultData["instructions"];
}

export interface OrientationResultAssembly {
  readonly assembled: ToolResultAssembly<OrientationResultData>;
  readonly details: ContextDetails;
  readonly displaySections: readonly ToolDisplaySection[];
}

/** Assemble Orientation facts and shared result policy before rendering. */
export function assembleOrientationResult(data: OrientationResultData): OrientationResultAssembly {
  const sections = data.sections.map(toResultSection);
  const evidenceLists = data.sections.flatMap((section) => section.evidenceLists);
  const assembled = assembleToolResult({
    data,
    sections,
    evidenceLists,
    nextQueries: data.nextQueries,
    readNext: data.readNext,
    confidence: data.confidence,
    provenance: uniqueProvenance(data.sections),
  });
  const details = assembleOrientationDetails({
    confidence: assembled.confidence,
    focusTarget: assembled.data.focusTarget,
    requestedSections: assembled.data.requestedSections,
    renderedSections: assembled.data.renderedSections,
    omittedCount: assembled.totals.omittedCount,
    evidenceLists: assembled.evidenceLists,
    sections: assembled.data.sections,
    nextQueries: assembledNextQueries(assembled),
    readNext: assembledReadNext(assembled),
    target: assembled.data.target,
    resolution: assembled.data.resolution,
    instructions: assembled.data.instructions,
  });

  return {
    assembled,
    details,
    displaySections: assembled.data.sections.map(orientationDisplaySection),
  };
}

/** Project canonical Orientation facts into structured Tool details. */
export function assembleOrientationDetails(input: OrientationDetailsInput): ContextDetails {
  return {
    confidence: input.confidence,
    task: input.task ?? null,
    focusTarget: input.focusTarget ?? null,
    requestedSections: [...(input.requestedSections ?? [])],
    renderedSections: [...(input.renderedSections ?? [])],
    omittedCount: input.omittedCount ?? 0,
    evidenceLists: input.evidenceLists ? [...input.evidenceLists] : undefined,
    sections: input.sections?.map(toDetailsSection),
    nextQueries: [...input.nextQueries],
    readNext: input.readNext ? [...input.readNext] : undefined,
    target: input.target ? { ...input.target } : undefined,
    ...(input.resolution ? { resolution: input.resolution } : {}),
    instructions: input.instructions,
    candidates: input.candidates?.map((candidate) => ({
      targetId: candidate.targetId,
      name: candidate.name,
      kind: candidate.kind,
      container: candidate.container,
      file: candidate.file,
      line: candidate.line,
      character: candidate.character,
      rank: candidate.rank,
    })),
  };
}

function orientationDisplaySection(section: OrientationSectionData): ToolDisplaySection {
  const items = section.items.filter((item) => item.kind !== "blank");
  const key = `orientation.${section.key}`;
  const evidence = section.evidenceLists.find((list) => list.key === section.tableEvidenceKey);
  if (evidence) {
    const rows = orientationTableRows(items);
    const display = createToolDisplaySection({
      key,
      title: section.title,
      items: rows,
      evidence,
      format: (row: string) => row,
    });
    return rows.length
      ? display
      : {
          ...display,
          lines: items
            .slice(0, MAX_TUI_DISPLAY_ITEMS)
            .map((item) => truncateDisplayText(formatOrientationItem(item))),
        };
  }
  const grouped = section.key === "workspace.memberships";
  const summaries = section.evidenceLists.map((list) => {
    const prefix = section.evidenceLists.length > 1 ? `${list.key}: ` : "";
    return `${prefix}${orientationEvidenceSelection(list, grouped ? "memberships" : undefined)}`;
  });
  // Preview blocks are framing, not Evidence atoms; the summary carries the evidence.
  return createToolDisplaySection({
    key,
    title: section.title,
    items,
    evidence: blockEvidence(key, items, section.reason),
    format: formatOrientationItem,
    preview: {
      unit: grouped ? "group" : "block",
      ...(summaries.length ? { evidenceSummary: summaries.join("; ") } : {}),
    },
  });
}

function blockEvidence(key: string, items: readonly OrientationItem[], reason: string | null) {
  return reason
    ? createPartialEvidenceList({
        key,
        items,
        partialReason: "provider-limited",
        partialMessage: reason,
      }).metadata
    : createEvidenceList({ key, items }).metadata;
}

/** Canonical selection phrase; a capped group preview need not show every atom. */
function orientationEvidenceSelection(list: EvidenceListMetadata, noun?: string): string {
  return list.completeness === "complete" && !noun
    ? `${list.totalCount} observed`
    : describeEvidenceList(list, noun);
}

/** Keep table headers and group context with the first evidence row, outside its count. */
function orientationTableRows(items: readonly OrientationItem[]): string[] {
  let framing: string[] = [];
  return items.flatMap((item) => {
    if (item.kind !== "table") {
      framing.push(formatOrientationItem(item));
      return [];
    }
    const rows = item.rows.map((row, index) =>
      [...(index === 0 ? [...framing, item.headers.join(" | ")] : []), row.join(" | ")].join("\n"),
    );
    framing = [];
    return rows;
  });
}

function formatOrientationItem(item: OrientationItem): string {
  switch (item.kind) {
    case "paragraph":
    case "list-item":
    case "subheading":
      return item.text;
    case "code":
      return item.lines.join(" ");
    case "blank":
      return "";
    case "table":
      return [item.headers.join(" | "), ...item.rows.map((row) => row.join(" | "))].join("\n");
  }
}

function toResultSection(section: OrientationSectionData): ResultSection {
  return {
    key: section.key,
    title: section.title,
    status: section.status,
    items: [section.key],
    confidence: section.confidence,
    provenance: section.provenance,
  };
}

function toDetailsSection(section: OrientationSectionData): OrientationSectionDetails {
  return {
    key: section.key,
    title: section.title,
    status: section.status,
    reason: section.reason,
    confidence: section.confidence,
    provenance: section.provenance.map((provenance) => ({ ...provenance })),
    evidenceLists: section.evidenceLists.map((evidence) => ({ ...evidence })),
    ...(section.errorRanges ? { errorRanges: [...section.errorRanges] } : {}),
  };
}

function uniqueProvenance(sections: readonly OrientationSectionData[]) {
  const seen = new Set<string>();
  return sections.flatMap((section) =>
    section.provenance.filter((provenance) => {
      const key = `${provenance.source}:${provenance.capability ?? ""}:${provenance.detail ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { contextErrorResult } from "../result/errors.ts";
import { renderOrientationResult } from "./markdown.ts";
import { structuredOrientation } from "./structured.ts";
import { prepareWorkspaceOutput } from "./workspace-output.ts";

type OrientationOutcome = Awaited<ReturnType<CodeIntelToolExecCtx["session"]["orient"]>>;

/** Assemble the final model-visible code_orientation result for one workflow outcome. */
export function finishOrientationResult(outcome: OrientationOutcome, cwd: string): CodeIntelResult {
  if (outcome.kind === "unavailable") throw new Error(outcome.reason);
  if (outcome.kind === "invalid-input") return invalidOrientationResult(outcome);
  if (outcome.kind === "disambiguation" || outcome.kind === "kind-mismatch") {
    const selection = assembleCandidateSelection({
      outcome,
      key: "orientation.candidates",
      cwd,
      recovery:
        outcome.kind === "kind-mismatch"
          ? "Retry without symbolKind, use an observed provider kind, or focus one handle"
          : "Use one candidate handle as focus.target.handle",
    });
    const candidates = [...selection.candidates];
    const nextQueries = [...selection.nextQueries];
    return {
      content: selection.content,
      structuredContent: structuredOrientation({ ...outcome, candidates }, { nextQueries }),
      details: {
        type: "context",
        data: assembleOrientationDetails({
          confidence: "semantic",
          omittedCount: selection.evidence.omittedCount ?? 0,
          evidenceLists: [selection.evidence],
          candidates,
          nextQueries,
        }),
        status: selection.status,
        message: selection.message,
        displaySections: selection.displaySections,
      },
    };
  }
  return finishCompletedOrientation(outcome.data, cwd);
}

function invalidOrientationResult(
  outcome: Extract<OrientationOutcome, { kind: "invalid-input" }>,
): CodeIntelResult {
  const rejection = outcome.symlinkRejection;
  const recovery = "Resolve the requested path explicitly and retry with its canonical path.";
  const message = rejection
    ? `Requested focus ${JSON.stringify(rejection.requestedPath)} traverses a symbolic link: ${JSON.stringify(rejection.blockedPath)}. Orientation does not follow symbolic links.\n\n${recovery}`
    : outcome.message;
  return {
    ...contextErrorResult(`**Error:** ${message}`, {
      nextQueries: rejection ? [recovery] : ["Choose an existing path, module, or precise target"],
      message,
    }),
    structuredContent: structuredOrientation(outcome),
  };
}

function finishCompletedOrientation(input: OrientationResultData, cwd: string): CodeIntelResult {
  const data = {
    ...input,
    ...(input.target
      ? { target: { ...input.target, file: toDisplayPath(cwd, input.target.file) } }
      : {}),
    ...((input.workspace || input.focusKind === "file") && input.focusTarget !== null
      ? { focusTarget: toDisplayPath(cwd, input.focusTarget) }
      : {}),
  };
  const navigation = data.workspace ? prepareWorkspaceOutput(data) : null;
  const assembly = assembleOrientationResult(navigation?.data ?? data);
  return {
    content: navigation?.content ?? renderOrientationResult(assembly),
    structuredContent: structuredOrientation(
      { kind: "completed", data },
      { snapshotPath: navigation?.snapshotPath },
    ),
    details: {
      type: "context",
      data: assembly.details,
      budgetWarning: navigation?.warning,
      ...(navigation ? { modelBudgetManaged: true } : {}),
      status: "completed",
      displaySections: assembly.displaySections,
    },
  };
}
