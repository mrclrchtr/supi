import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { EvidenceList, EvidenceListMetadata } from "../../analysis/evidence.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import type { GraphSection } from "../../session/graph-types.ts";
import {
  assembledReadNext,
  assembleToolResult,
  type ResultProvenance,
  type ToolResultAssembly,
} from "../result/assembly.ts";
import { formatCandidateRow, formatPartialCandidateDisclosure } from "../result/candidate-row.ts";
import { createToolDisplaySection } from "../result/display.ts";
import type { ToolDisplaySection } from "../result/types.ts";
import type { GraphDetails, GraphFileGroup, GraphSectionDetails } from "./details.ts";
import { graphDisplaySection } from "./display.ts";
import { formatGraphEvidence } from "./format.ts";
import { graphReadNext } from "./read-next.ts";
import { type AssembledGraphSection, assembleGraphSection } from "./section.ts";
import { structuredGraphCandidates, structuredGraphResult } from "./structured.ts";

export type { GraphRelationKind, GraphSection } from "../../session/graph-types.ts";

/** Presentation-neutral assembled graph result. */
export interface GraphResultAssembly {
  displayName: string;
  sections: readonly AssembledGraphSection[];
  resolvedDisplayFile: string;
  cwd: string;
  assembled: ToolResultAssembly<{ readonly sections: readonly AssembledGraphSection[] }>;
  details: GraphDetails;
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
  const sections = input.sections.map((section) =>
    assembleGraphSection(section, input.maxResults, input.cwd),
  );
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
    readNext: graphReadNext(sections, input.cwd),
    candidateCount,
    confidence,
    provenance,
  });

  const displays = sections.map((section) => graphDisplaySection(section, input.cwd));
  const displaySections = displays.map(({ display }) => display);

  return {
    displayName: input.displayName,
    sections,
    resolvedDisplayFile: input.resolvedDisplayFile,
    cwd: input.cwd,
    assembled,
    displaySections,
    details: {
      targetName: input.displayName,
      targetFile: input.resolvedDisplayFile,
      sections: sections.map((section, index) =>
        graphSectionDetails(section, input.cwd, displays[index].fileGroups),
      ),
      readNext: assembledReadNext(assembled),
      evidenceLists: [...assembled.evidenceLists],
    },
  };
}

function graphSectionDetails(
  section: AssembledGraphSection,
  cwd: string,
  fileGroups: GraphFileGroup[],
): GraphSectionDetails {
  const calls = section.kind === "ok" && section.rel === "callees" ? section.data : null;
  return {
    rel: section.rel,
    source: section.rel === "callees" ? "structural" : "semantic",
    status: section.kind === "ok" ? evidenceStatus(section.evidence) : "unavailable",
    message: section.kind === "unavailable" ? section.message : null,
    externalCount:
      section.kind === "ok" && section.rel !== "callees" ? section.data.externalCount : 0,
    enclosingScope: calls
      ? { ...calls.enclosingScope, file: toDisplayPath(cwd, calls.enclosingScope.file) }
      : null,
    depth: calls?.depth ?? null,
    recovery: calls?.recovery
      ? { ...calls.recovery, file: toDisplayPath(cwd, calls.recovery.file) }
      : null,
    fileGroups,
  };
}

function evidenceTotal(evidence: EvidenceList<unknown>): number {
  return evidence.metadata.totalCount ?? evidence.metadata.shownCount;
}

function evidenceStatus(evidence: EvidenceList<unknown>): "complete" | "partial" {
  return evidence.metadata.partialReason !== null ? "partial" : "complete";
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

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { searchErrorResult } from "../result/errors.ts";
import { renderGraphResult } from "./markdown.ts";

type GraphOutcome = Awaited<ReturnType<CodeIntelToolExecCtx["session"]["graph"]>>;

/** Assemble the final model-visible code_graph result for one workflow outcome. */
export function finishGraphResult(outcome: GraphOutcome, cwd: string): CodeIntelResult {
  if (outcome.kind === "unavailable") throw new Error(outcome.reason);
  if (outcome.kind === "invalid-input") {
    return {
      ...searchErrorResult(`**Error:** ${outcome.message}`, { message: outcome.message }),
      structuredContent: {
        kind: "invalid-input",
        message: outcome.message,
        sections: [],
        evidenceLists: [],
        readNext: [],
        nextQueries: [],
      },
    };
  }
  if (outcome.kind === "disambiguation" || outcome.kind === "kind-mismatch") {
    return finishGraphCandidates(outcome, cwd);
  }

  const assembly = assembleGraphResult({
    displayName: outcome.displayName,
    sections: outcome.sections,
    resolvedDisplayFile: outcome.resolvedDisplayFile,
    maxResults: outcome.maxResults,
    cwd,
  });
  const displayTruncated = hasHiddenDisplayEvidence(assembly);
  return {
    content: renderGraphResult(assembly),
    structuredContent: structuredGraphResult(assembly),
    details: {
      type: "graph",
      data: assembly.details,
      status: "completed",
      displaySections: assembly.displaySections,
      ...(displayTruncated ? { truncation: { truncated: false, displayTruncated: true } } : {}),
    },
  };
}

function finishGraphCandidates(
  input: Extract<GraphOutcome, { kind: "disambiguation" | "kind-mismatch" }>,
  cwd: string,
): CodeIntelResult {
  const outcome = {
    ...input,
    candidates: input.candidates.map((candidate) => ({
      ...candidate,
      file: toDisplayPath(cwd, candidate.file),
    })),
  };
  const lines = [
    outcome.kind === "kind-mismatch"
      ? `**No target matched provider kind \`${outcome.requestedKind}\`. Near matches:**`
      : "**Target is ambiguous. Choose one candidate handle:**",
    "",
  ];
  for (const candidate of outcome.candidates) {
    lines.push(
      `- \`${candidate.targetId}\` — ${candidate.name} (\`${candidate.kind ?? "unknown"}\`) at ${candidate.file}:${candidate.line}:${candidate.character}`,
    );
  }
  const evidence = graphCandidateEvidence(outcome);
  lines.push(
    "",
    formatPartialCandidateDisclosure(evidence) ?? formatGraphEvidence(evidence, "candidates"),
  );
  if (outcome.kind === "kind-mismatch") {
    lines.push(
      "",
      "Retry without `symbolKind`, use an observed provider kind, or choose a handle.",
    );
  }
  const displaySections = [
    createToolDisplaySection({
      key: "graph.candidates",
      title: "Candidates",
      items: outcome.candidates,
      totalCount: evidence.totalCount,
      omittedCount: evidence.omittedCount,
      partialReason: evidence.partialReason,
      partialMessage: evidence.partialMessage,
      format: (candidate) => formatCandidateRow(candidate, "handle-first"),
    }),
  ];
  const nextQueries =
    outcome.kind === "kind-mismatch"
      ? ["Retry without symbolKind, use an observed provider kind, or choose a near-match handle"]
      : ["Choose one candidate handle, or narrow the symbol selector with scope or symbolKind"];
  const message =
    outcome.kind === "kind-mismatch"
      ? `No target matched provider kind ${outcome.requestedKind}.`
      : "The target is ambiguous.";
  return {
    ...searchErrorResult(lines.join("\n"), {
      confidence: "semantic",
      evidenceLists: [evidence],
      nextQueries,
      status: outcome.kind === "disambiguation" ? "disambiguation" : "invalid-input",
      message,
      displaySections,
    }),
    structuredContent: structuredGraphCandidates(outcome, evidence, { message, nextQueries }),
  };
}

function graphCandidateEvidence(
  outcome: Extract<GraphOutcome, { kind: "disambiguation" | "kind-mismatch" }>,
): EvidenceListMetadata {
  return {
    key: "graph.candidates",
    totalCount: outcome.totalCount,
    shownCount: outcome.candidates.length,
    omittedCount: outcome.omittedCount,
    partialReason: outcome.partialReason,
    partialMessage: outcome.partialMessage,
  };
}

function hasHiddenDisplayEvidence(assembly: GraphResultAssembly): boolean {
  return assembly.sections.some(
    (section, index) =>
      section.kind === "ok" &&
      assembly.displaySections[index].shownCount < section.evidence.items.length,
  );
}
