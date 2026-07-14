import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import type { ReadNextItem } from "../../analysis/read-next.ts";
import type {
  OrientationCandidate,
  OrientationResultData,
} from "../../session/orientation-types.ts";
import type { TargetStoreEntry } from "../../session/target-store.ts";
import {
  assembledNextQueries,
  assembledReadNext,
  assembleToolResult,
  type ToolResultAssembly,
} from "./assembly.ts";
import type { ContextDetails } from "./types.ts";

export interface OrientationDetailsInput {
  readonly confidence: ConfidenceMode;
  readonly task?: string | null;
  readonly focusTarget?: string | null;
  readonly requestedSections?: readonly string[];
  readonly renderedSections?: readonly string[];
  readonly omittedCount?: number;
  readonly evidenceLists?: readonly EvidenceListMetadata[];
  readonly nextQueries: readonly string[];
  readonly readNext?: readonly ReadNextItem[];
  readonly target?: Readonly<TargetStoreEntry>;
  readonly candidates?: readonly OrientationCandidate[];
  readonly instructions?: OrientationResultData["instructions"];
}

export interface OrientationResultAssembly {
  readonly assembled: ToolResultAssembly<OrientationResultData>;
  readonly details: ContextDetails;
}

/** Assemble Orientation facts and shared result policy before rendering. */
export function assembleOrientationResult(data: OrientationResultData): OrientationResultAssembly {
  const provenance = [
    {
      source: data.confidence === "semantic" ? ("semantic" as const) : ("structural" as const),
      capability: data.confidence === "semantic" ? "LSP" : "workspace-analysis",
    },
  ];
  const sectionEvidence = createOrientationEvidence(data);
  const assembled = assembleToolResult({
    data,
    sections: data.renderedSections.map((section) => ({
      key: section,
      title: section,
      status: "complete" as const,
      items: [section],
      confidence: data.confidence,
      provenance,
    })),
    evidenceLists: [sectionEvidence],
    nextQueries: data.nextQueries,
    readNext: data.readNext,
    candidateCount: sectionEvidence.totalCount ?? sectionEvidence.shownCount,
    confidence: data.confidence,
    provenance,
  });
  return {
    assembled,
    details: assembleOrientationDetails({
      confidence: assembled.confidence,
      focusTarget: assembled.data.focusTarget,
      requestedSections: assembled.data.requestedSections,
      renderedSections: assembled.data.renderedSections,
      omittedCount: assembled.totals.omittedCount,
      evidenceLists: assembled.evidenceLists,
      nextQueries: assembledNextQueries(assembled),
      readNext: assembledReadNext(assembled),
      target: assembled.data.target,
      instructions: assembled.data.instructions,
    }),
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

function createOrientationEvidence(data: OrientationResultData): EvidenceListMetadata {
  const omittedCount = Math.max(0, data.omittedCount);
  return {
    key: "orientation.sections",
    totalCount: data.renderedSections.length + omittedCount,
    shownCount: data.renderedSections.length,
    omittedCount,
    partialReason: null,
  };
}
