import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import {
  type EvidenceListMetadata,
  renderEvidenceListMetadataDisclosure,
} from "../../analysis/evidence.ts";
import type { ReadNextItem } from "../../analysis/read-next.ts";
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
import { formatCandidateRow, formatPartialCandidateDisclosure } from "../result/candidate-row.ts";
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
  readonly candidates?: readonly OrientationCandidate[];
  readonly instructions?: OrientationResultData["instructions"];
}

export interface OrientationResultAssembly {
  readonly assembled: ToolResultAssembly<OrientationResultData>;
  readonly details: ContextDetails;
  readonly displaySections: readonly ToolDisplaySection[];
}

/** Build structured candidate rows for an unresolved Orientation target. */
export function orientationCandidateDisplaySections(
  candidates: readonly OrientationCandidate[],
  evidence: EvidenceListMetadata,
): readonly ToolDisplaySection[] {
  return [
    createToolDisplaySection({
      key: "orientation.candidates",
      title: "Candidates",
      items: candidates,
      totalCount: evidence.totalCount,
      omittedCount: evidence.omittedCount,
      partialReason: evidence.partialReason,
      partialMessage: evidence.partialMessage,
      format: (candidate) => formatCandidateRow(candidate, "rank-first"),
    }),
  ];
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
  const input = {
    key: `orientation.${section.key}`,
    title: section.title,
    partialReason:
      section.evidenceLists.find((evidence) => evidence.partialReason)?.partialReason ??
      (section.reason ? "provider-limited" : null),
    ...(section.reason ? { partialMessage: section.reason } : {}),
  };
  const evidence = section.evidenceLists.find((list) => list.key === section.tableEvidenceKey);
  if (evidence) {
    const rows = orientationTableRows(items);
    const display = createToolDisplaySection({
      ...input,
      items: rows,
      totalCount: evidence.totalCount,
      omittedCount: evidence.omittedCount,
      partialReason: evidence.partialReason ?? input.partialReason,
      partialMessage: evidence.partialMessage ?? input.partialMessage,
      format: (row) => row,
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
  return createToolDisplaySection({
    ...input,
    items,
    totalCount: items.length,
    omittedCount: 0,
    format: formatOrientationItem,
    preview: {
      unit: grouped ? "group" : "block",
      ...(summaries.length ? { evidenceSummary: summaries.join("; ") } : {}),
    },
  });
}

/** Describe canonical selection separately: a capped group preview need not show every atom. */
function orientationEvidenceSelection(list: EvidenceListMetadata, noun?: string): string {
  const label = noun ? ` ${noun}` : "";
  const explanation = list.partialMessage ? `; ${list.partialMessage}` : "";
  if (list.totalCount === null) {
    const omitted = list.omittedCount ? `; ${list.omittedCount} collected omitted` : "";
    return `${list.shownCount}${label} selected${omitted}; more may exist — ${list.partialReason ?? "partial"}${explanation}`;
  }
  const partial = list.partialReason ? `; partial — ${list.partialReason}` : "";
  if (list.omittedCount) {
    return `${list.shownCount} of ${list.totalCount}${label} selected; ${list.omittedCount} omitted${partial}${explanation}`;
  }
  return `${list.totalCount}${label || " observed"}${partial}${explanation}`;
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
export function finishOrientationResult(outcome: OrientationOutcome): CodeIntelResult {
  if (outcome.kind === "unavailable") throw new Error(outcome.reason);
  if (outcome.kind === "invalid-input") return invalidOrientationResult(outcome);
  if (outcome.kind === "disambiguation" || outcome.kind === "kind-mismatch") {
    const candidates = outcome.candidates;
    const lines = [
      outcome.kind === "kind-mismatch"
        ? `# No Orientation target matched provider kind \`${outcome.requestedKind}\``
        : "# Multiple Orientation targets",
      "",
    ];
    for (const candidate of candidates) {
      lines.push(
        `${candidate.rank}. **${candidate.name}** (\`${candidate.kind ?? "unknown"}\`) — \`${candidate.file}\`:${candidate.line}:${candidate.character} — \`${candidate.targetId}\``,
      );
    }
    const evidence: EvidenceListMetadata = {
      key: "orientation.candidates",
      totalCount: outcome.totalCount,
      shownCount: candidates.length,
      omittedCount: outcome.omittedCount,
      partialReason: outcome.partialReason,
      partialMessage: outcome.partialMessage,
    };
    const disclosure =
      formatPartialCandidateDisclosure(evidence) ?? renderEvidenceListMetadataDisclosure(evidence);
    if (disclosure) lines.push("", disclosure);
    const nextQueries =
      outcome.kind === "kind-mismatch"
        ? ["Retry without symbolKind, use an observed provider kind, or focus one handle"]
        : ["Use one candidate handle as focus.target.handle"];
    const details = assembleOrientationDetails({
      confidence: "semantic",
      omittedCount: evidence.omittedCount ?? 0,
      evidenceLists: [evidence],
      candidates,
      nextQueries,
    });
    return {
      content: lines.join("\n"),
      structuredContent: structuredOrientation(outcome),
      details: {
        type: "context",
        data: details,
        status: "completed",
        message: orientationSelectionMessage(outcome),
        displaySections: orientationCandidateDisplaySections(candidates, evidence),
      },
    };
  }
  return finishCompletedOrientation(outcome.data);
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

function finishCompletedOrientation(data: OrientationResultData): CodeIntelResult {
  const navigation = data.workspace ? prepareWorkspaceOutput(data) : null;
  const assembly = assembleOrientationResult(navigation?.data ?? data);
  return {
    content: navigation?.content ?? renderOrientationResult(assembly),
    structuredContent: structuredOrientation({ kind: "completed", data }, navigation?.snapshotPath),
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

function orientationSelectionMessage(
  outcome: Extract<OrientationOutcome, { kind: "disambiguation" | "kind-mismatch" }>,
): string {
  return outcome.kind === "kind-mismatch"
    ? `No Orientation target matched provider kind ${outcome.requestedKind}.`
    : "Multiple Orientation targets require one candidate.";
}
