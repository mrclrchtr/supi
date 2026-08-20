import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
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
import { createToolDisplaySection } from "../result/display.ts";
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
  omittedCount = 0,
): readonly ToolDisplaySection[] {
  return [
    createToolDisplaySection({
      key: "orientation.candidates",
      title: "Candidates",
      items: candidates,
      totalCount: candidates.length + omittedCount,
      omittedCount,
      format: (candidate) =>
        `${candidate.rank}. ${candidate.name} (${candidate.kind ?? "unknown"}) — ${candidate.file}:${candidate.line}:${candidate.character} [${candidate.targetId}]`,
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
  return createToolDisplaySection({
    key: `orientation.${section.key}`,
    title: section.title,
    items,
    totalCount: items.length,
    omittedCount: 0,
    partialReason:
      section.reason ??
      section.evidenceLists.find((evidence) => evidence.partialReason)?.partialReason,
    format: formatOrientationItem,
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

type OrientationOutcome = Awaited<ReturnType<CodeIntelToolExecCtx["session"]["orient"]>>;

/** Assemble the final model-visible code_orientation result for one workflow outcome. */
export function finishOrientationResult(outcome: OrientationOutcome): CodeIntelResult {
  if (outcome.kind === "unavailable") throw new Error(outcome.reason);
  if (outcome.kind === "invalid-input") {
    return contextErrorResult(`**Error:** ${outcome.message}`, {
      nextQueries: ["Choose an existing path, module, or precise target"],
      message: outcome.message,
    });
  }
  if (outcome.kind === "disambiguation" || outcome.kind === "kind-mismatch") {
    const candidates = outcome.candidates ?? [];
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
    const nextQueries =
      outcome.kind === "kind-mismatch"
        ? ["Retry without symbolKind, use an observed provider kind, or focus one handle"]
        : ["Use one candidate handle as focus.target.handle"];
    const details = assembleOrientationDetails({
      confidence: "semantic",
      omittedCount: outcome.omittedCount,
      candidates,
      nextQueries,
    });
    return {
      content: lines.join("\n"),
      details: {
        type: "context",
        data: details,
        status: "completed",
        displaySections: orientationCandidateDisplaySections(candidates, outcome.omittedCount),
      },
    };
  }
  const assembly = assembleOrientationResult(outcome.data);
  return {
    content: renderOrientationResult(assembly),
    details: {
      type: "context",
      data: assembly.details,
      status: "completed",
      displaySections: assembly.displaySections,
    },
  };
}
