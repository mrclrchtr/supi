import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { GraphSection } from "../../session/graph-types.ts";
import {
  assembledNextQueries,
  assembleToolResult,
  type ResultProvenance,
  type ToolResultAssembly,
} from "./assembly.ts";
import type { SearchDetails } from "./types.ts";

export type { GraphRelationKind, GraphSection } from "../../session/graph-types.ts";

/** Presentation-neutral assembled graph result. */
export interface GraphResultAssembly {
  displayName: string;
  sections: readonly GraphSection[];
  resolvedDisplayFile: string;
  maxResults: number;
  cwd: string;
  assembled: ToolResultAssembly<{ readonly sections: readonly GraphSection[] }>;
  details: SearchDetails;
}

/** Assemble graph facts and evidence-list metadata before presentation adapters render them. */
export function assembleGraphResult(input: {
  displayName: string;
  sections: readonly GraphSection[];
  resolvedDisplayFile: string;
  maxResults: number;
  cwd: string;
}): GraphResultAssembly {
  const evidenceLists = input.sections.flatMap((section) =>
    section.kind === "ok" ? section.evidenceLists : [],
  );
  const candidateCount = input.sections.reduce(
    (sum, section) => sum + (section.kind === "ok" ? sectionCount(section) : 0),
    0,
  );
  const confidence = graphConfidence(input.sections);
  const provenance = graphProvenance(input.sections);
  const assembled = assembleToolResult({
    data: { sections: input.sections },
    sections: input.sections.map((section) => ({
      key: section.rel,
      title: section.rel,
      status: section.kind === "ok" ? "complete" : "unavailable",
      items: section.kind === "ok" ? graphSectionItems(section) : [],
      confidence: sectionConfidence(section),
      provenance: section.kind === "ok" ? graphProvenance([section]) : [],
    })),
    evidenceLists,
    nextQueries: ["Use code_orientation on an exact result before editing"],
    readNext: input.sections.flatMap((section) => (section.kind === "ok" ? section.readNext : [])),
    candidateCount,
    confidence,
    provenance,
  });

  return {
    ...input,
    assembled,
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

function sectionCount(section: Extract<GraphSection, { kind: "ok" }>): number {
  switch (section.rel) {
    case "references":
      return section.data.references.length;
    case "callees":
      return section.data.calls.length;
    case "implements":
      return section.data.implementations.length;
  }
}

function graphSectionItems(section: Extract<GraphSection, { kind: "ok" }>): readonly unknown[] {
  switch (section.rel) {
    case "references":
      return section.data.references;
    case "callees":
      return section.data.calls;
    case "implements":
      return section.data.implementations;
  }
}

function sectionConfidence(section: GraphSection): ConfidenceMode {
  if (section.kind !== "ok") return "unavailable";
  return section.rel === "callees" ? "structural" : "semantic";
}

function graphProvenance(sections: readonly GraphSection[]): ResultProvenance[] {
  const result: ResultProvenance[] = [];
  if (sections.some((section) => section.kind === "ok" && section.rel !== "callees")) {
    result.push({ source: "semantic", capability: "LSP" });
  }
  if (sections.some((section) => section.kind === "ok" && section.rel === "callees")) {
    result.push({ source: "structural", capability: "tree-sitter" });
  }
  return result;
}

function graphConfidence(sections: readonly GraphSection[]): ConfidenceMode {
  const hasSemantic = sections.some(
    (section) =>
      section.kind === "ok" && (section.rel === "references" || section.rel === "implements"),
  );
  const hasStructural = sections.some(
    (section) => section.kind === "ok" && section.rel === "callees",
  );
  return hasSemantic ? "semantic" : hasStructural ? "structural" : "unavailable";
}
