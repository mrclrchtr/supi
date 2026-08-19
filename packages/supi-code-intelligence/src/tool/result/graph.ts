import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import { createEvidenceList, type EvidenceList } from "../../analysis/evidence.ts";
import type { RelationLocationPartialReason } from "../../analysis/relations/provider-locations.ts";
import type {
  CallEntry,
  ImplementationEntry,
  ReferenceEntry,
} from "../../analysis/relations/types.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import type { GraphSection } from "../../session/graph-types.ts";
import {
  assembledNextQueries,
  assembleToolResult,
  type ResultProvenance,
  type ToolResultAssembly,
} from "./assembly.ts";
import { createToolDisplaySection } from "./display.ts";
import type { SearchDetails, ToolDisplaySection } from "./types.ts";

export type { GraphRelationKind, GraphSection } from "../../session/graph-types.ts";

type UnavailableGraphSection = Extract<GraphSection, { kind: "unavailable" }>;
type ReferenceGraphSection = Extract<GraphSection, { kind: "ok"; rel: "references" }>;
type CalleeGraphSection = Extract<GraphSection, { kind: "ok"; rel: "callees" }>;
type ImplementationGraphSection = Extract<GraphSection, { kind: "ok"; rel: "implements" }>;

/** A relation section after canonical evidence bounding. */
export type AssembledGraphSection =
  | UnavailableGraphSection
  | (ReferenceGraphSection & { readonly evidence: EvidenceList<ReferenceEntry> })
  | (CalleeGraphSection & { readonly evidence: EvidenceList<CallEntry> })
  | (ImplementationGraphSection & {
      readonly evidence: EvidenceList<ImplementationEntry>;
    });

/** Presentation-neutral assembled graph result. */
export interface GraphResultAssembly {
  displayName: string;
  sections: readonly AssembledGraphSection[];
  resolvedDisplayFile: string;
  cwd: string;
  assembled: ToolResultAssembly<{ readonly sections: readonly AssembledGraphSection[] }>;
  details: SearchDetails;
  displaySections: readonly ToolDisplaySection[];
}

/** Assemble graph evidence once before either presentation adapter consumes it. */
export function assembleGraphResult(input: {
  displayName: string;
  sections: readonly GraphSection[];
  resolvedDisplayFile: string;
  maxResults: number;
  cwd: string;
}): GraphResultAssembly {
  const sections = input.sections.map((section) => assembleGraphSection(section, input.maxResults));
  const evidenceLists = sections.flatMap((section) =>
    section.kind === "ok" ? [section.evidence.metadata] : [],
  );
  const candidateCount = sections.reduce(
    (sum, section) => sum + (section.kind === "ok" ? evidenceTotal(section.evidence) : 0),
    0,
  );
  const confidence = graphConfidence(sections);
  const provenance = graphProvenance(sections);
  const assembled = assembleToolResult({
    data: { sections },
    sections: sections.map((section) => ({
      key: section.rel,
      title: section.rel,
      status: section.kind === "ok" ? evidenceStatus(section.evidence) : "unavailable",
      items: section.kind === "ok" ? section.evidence.items : [],
      confidence: sectionConfidence(section),
      provenance: section.kind === "ok" ? graphProvenance([section]) : [],
    })),
    evidenceLists,
    nextQueries: [],
    readNext: sections.flatMap((section) => (section.kind === "ok" ? section.readNext : [])),
    candidateCount,
    confidence,
    provenance,
  });

  const displaySections = sections.map((section) => graphDisplaySection(section, input.cwd));

  return {
    displayName: input.displayName,
    sections,
    resolvedDisplayFile: input.resolvedDisplayFile,
    cwd: input.cwd,
    assembled,
    displaySections,
    details: {
      confidence,
      scope: null,
      candidateCount,
      omittedCount: assembled.totals.omittedCount,
      evidenceLists: [...assembled.evidenceLists],
      nextQueries: assembledNextQueries(assembled),
    },
  };
}

function graphDisplaySection(section: AssembledGraphSection, cwd: string): ToolDisplaySection {
  if (section.kind === "unavailable") {
    return createToolDisplaySection({
      key: `graph.${section.rel}`,
      title: section.rel,
      items: [section.message],
      format: (message) => `Unavailable — ${message}`,
      totalCount: 1,
    });
  }

  return createToolDisplaySection({
    key: `graph.${section.rel}`,
    title: section.rel,
    items: section.evidence.items as readonly unknown[],
    totalCount: section.evidence.metadata.totalCount,
    omittedCount: section.evidence.metadata.omittedCount,
    partialReason: section.evidence.metadata.partialReason,
    format: (item) => formatGraphDisplayItem(section.rel, item, cwd),
  });
}

function formatGraphDisplayItem(
  relation: "references" | "callees" | "implements",
  item: unknown,
  cwd: string,
): string {
  if (relation === "callees") {
    const call = item as { name: string; file: string; line: number };
    return `${call.name} — ${toDisplayPath(cwd, call.file)}:L${call.line}`;
  }

  const location = item as { name: string | null; file: string; line: number; character: number };
  const name = location.name ? `${location.name} — ` : "";
  return `${name}${toDisplayPath(cwd, location.file)}:L${location.line}:${location.character}`;
}

function assembleGraphSection(section: GraphSection, maxResults: number): AssembledGraphSection {
  if (section.kind === "unavailable") return section;
  switch (section.rel) {
    case "references":
      return {
        ...section,
        evidence: createRelationEvidenceList({
          key: "references.locations",
          items: [...section.data.references],
          maxResults,
          invalidLocationCount: section.data.invalidLocationCount,
          partialReason: section.data.partialReason,
        }),
      };
    case "callees":
      return {
        ...section,
        evidence: createEvidenceList({
          key: "callees.calls",
          items: [...section.data.calls],
          maxResults,
        }),
      };
    case "implements":
      return {
        ...section,
        evidence: createRelationEvidenceList({
          key: "implements.locations",
          items: [...section.data.implementations],
          maxResults,
          invalidLocationCount: section.data.invalidLocationCount,
          partialReason: section.data.partialReason,
        }),
      };
  }
}

function createRelationEvidenceList<T>(params: {
  key: string;
  items: T[];
  maxResults: number;
  invalidLocationCount: number;
  partialReason: RelationLocationPartialReason | null;
}): EvidenceList<T> {
  const evidence = createEvidenceList({
    key: params.key,
    items: params.items,
    maxResults: params.maxResults,
  });
  if (params.partialReason === null) return evidence;
  return {
    ...evidence,
    metadata: {
      ...evidence.metadata,
      partialReason: params.partialReason,
      invalidLocationCount: params.invalidLocationCount,
    },
  };
}

function evidenceTotal(evidence: EvidenceList<unknown>): number {
  return evidence.metadata.totalCount ?? evidence.metadata.shownCount;
}

function evidenceStatus(evidence: EvidenceList<unknown>): "complete" | "partial" {
  return evidence.metadata.partialReason !== null || (evidence.metadata.omittedCount ?? 0) > 0
    ? "partial"
    : "complete";
}

function sectionConfidence(section: AssembledGraphSection): ConfidenceMode {
  if (section.kind !== "ok") return "unavailable";
  return section.rel === "callees" ? "structural" : "semantic";
}

function graphProvenance(sections: readonly AssembledGraphSection[]): ResultProvenance[] {
  const result: ResultProvenance[] = [];
  if (sections.some((section) => section.kind === "ok" && section.rel !== "callees")) {
    result.push({ source: "semantic", capability: "LSP" });
  }
  if (sections.some((section) => section.kind === "ok" && section.rel === "callees")) {
    result.push({ source: "structural", capability: "tree-sitter" });
  }
  return result;
}

function graphConfidence(sections: readonly AssembledGraphSection[]): ConfidenceMode {
  const hasSemantic = sections.some(
    (section) =>
      section.kind === "ok" && (section.rel === "references" || section.rel === "implements"),
  );
  const hasStructural = sections.some(
    (section) => section.kind === "ok" && section.rel === "callees",
  );
  return hasSemantic ? "semantic" : hasStructural ? "structural" : "unavailable";
}
