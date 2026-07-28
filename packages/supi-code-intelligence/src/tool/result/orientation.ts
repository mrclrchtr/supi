import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import type { ReadNextItem } from "../../analysis/read-next.ts";
import type {
  OrientationCandidate,
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
} from "./assembly.ts";
import type { ContextDetails, OrientationSectionDetails } from "./types.ts";

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
  return {
    assembled,
    details: assembleOrientationDetails({
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
