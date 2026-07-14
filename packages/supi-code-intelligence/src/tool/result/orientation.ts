import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type {
  OrientationCandidate,
  OrientationResultData,
} from "../../session/orientation-types.ts";
import type { TargetStoreEntry } from "../../session/target-store.ts";
import { assembledNextQueries, assembleToolResult, type ToolResultAssembly } from "./assembly.ts";
import type { ContextDetails } from "./types.ts";

export interface OrientationDetailsInput {
  readonly confidence: ConfidenceMode;
  readonly task?: string | null;
  readonly focusTarget?: string | null;
  readonly requestedSections?: readonly string[];
  readonly renderedSections?: readonly string[];
  readonly omittedCount?: number;
  readonly nextQueries: readonly string[];
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
  const assembled = assembleToolResult({
    data,
    sections: data.renderedSections.map((section) => ({
      key: section,
      title: section,
      status: "complete" as const,
      items: data.blocks,
      confidence: data.confidence,
      provenance,
    })),
    nextQueries: data.nextQueries,
    readNext: data.readNext,
    candidateCount: data.blocks.length,
    confidence: data.confidence,
    provenance,
  });
  return {
    assembled,
    details: assembleOrientationDetails({
      confidence: data.confidence,
      focusTarget: data.focusTarget,
      requestedSections: data.requestedSections,
      renderedSections: data.renderedSections,
      omittedCount: data.omittedCount,
      nextQueries: assembledNextQueries(assembled),
      target: data.target,
      instructions: data.instructions,
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
    nextQueries: [...input.nextQueries],
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
