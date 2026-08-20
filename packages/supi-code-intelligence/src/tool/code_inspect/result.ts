import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import {
  createEvidenceList,
  createPartialEvidenceList,
  type EvidenceList,
} from "../../analysis/evidence.ts";
import type {
  InspectDefinition,
  InspectDiagnostic,
  InspectObservation,
  InspectResultData,
} from "../../session/inspect-types.ts";
import {
  assembledNextQueries,
  assembleToolResult,
  type ResultProvenance,
  type ResultSection,
  type ToolResultAssembly,
} from "../result/assembly.ts";
import { createToolDisplaySection, truncateDisplayText } from "../result/display.ts";
import type { InspectDetails, InspectSectionDetails, ToolDisplaySection } from "../result/types.ts";

export type { InspectResultData } from "../../session/inspect-types.ts";

/** Assembled inspection evidence consumed by markdown and TUI adapters. */
export interface InspectResultAssembly {
  data: InspectResultData;
  displayedDefinitions: readonly InspectDefinition[];
  displayedDiagnostics: readonly InspectDiagnostic[];
  definitionEvidence: EvidenceList<InspectDefinition> | null;
  diagnosticEvidence: EvidenceList<InspectDiagnostic> | null;
  assembled: ToolResultAssembly<InspectResultData>;
  details: InspectDetails;
  displaySections: readonly ToolDisplaySection[];
}

/** Assemble code_inspect evidence/details before presentation adapters render it. */
export function assembleInspectResult(
  data: InspectResultData,
  nextQueries: readonly string[],
): InspectResultAssembly {
  const definitionEvidence = listEvidence(
    "inspect.definitions",
    data.sections.definition,
    data.maxResults,
  );
  const diagnosticEvidence = listEvidence(
    "inspect.diagnostics",
    data.sections.diagnostics,
    data.maxResults,
  );
  const sections = inspectResultSections(data);
  const provenance = overallProvenance(data);
  const evidenceLists = [definitionEvidence, diagnosticEvidence].flatMap((evidence) =>
    evidence ? [evidence.metadata] : [],
  );
  const assembled = assembleToolResult({
    data,
    sections,
    evidenceLists,
    nextQueries,
    candidateCount: sections.reduce((sum, section) => sum + section.items.length, 0),
    confidence: data.confidence,
    provenance,
  });

  const displaySections = buildInspectDisplaySections({
    data,
    displayedDefinitions: definitionEvidence?.items ?? [],
    displayedDiagnostics: diagnosticEvidence?.items ?? [],
    definitionEvidence,
    diagnosticEvidence,
  });

  return {
    data,
    displayedDefinitions: definitionEvidence?.items ?? [],
    displayedDiagnostics: diagnosticEvidence?.items ?? [],
    definitionEvidence,
    diagnosticEvidence,
    assembled,
    displaySections,
    details: {
      confidence: data.confidence,
      focusTarget: `${data.relPath}:${data.line}:${data.character}`,
      diagnosticWindow: { ...data.diagnosticWindow },
      sections: inspectSectionDetails(data),
      evidenceLists: [...assembled.evidenceLists],
      nextQueries: assembledNextQueries(assembled),
    },
  };
}

function buildInspectDisplaySections(input: {
  data: InspectResultData;
  displayedDefinitions: readonly InspectDefinition[];
  displayedDiagnostics: readonly InspectDiagnostic[];
  definitionEvidence: EvidenceList<InspectDefinition> | null;
  diagnosticEvidence: EvidenceList<InspectDiagnostic> | null;
}): ToolDisplaySection[] {
  const sections: ToolDisplaySection[] = [];
  const { data } = input;

  if (data.sections.node.kind !== "unavailable" && data.sections.node.data) {
    const node = data.sections.node.data;
    sections.push(
      createToolDisplaySection({
        key: "inspect.node",
        title: "Syntax node",
        items: [node],
        format: (item) =>
          `${item.type} at ${data.relPath}:${item.startLine}:${item.startCharacter}–${item.endLine}:${item.endCharacter}${item.text ? ` — ${truncateDisplayText(item.text, 160)}` : ""}`,
        partialReason: observationReason(data.sections.node),
      }),
    );
  }

  if (data.sections.enclosingSymbol.kind !== "unavailable" && data.sections.enclosingSymbol.data) {
    const symbol = data.sections.enclosingSymbol.data;
    sections.push(
      createToolDisplaySection({
        key: "inspect.enclosingSymbol",
        title: "Enclosing symbol",
        items: [symbol],
        format: (item) =>
          `${item.name} (${item.kind}) L${item.startLine}:${item.startCharacter}–L${item.endLine}:${item.endCharacter}`,
        partialReason: observationReason(data.sections.enclosingSymbol),
      }),
    );
  }

  if (data.sections.hover.kind !== "unavailable" && data.sections.hover.data) {
    sections.push(
      createToolDisplaySection({
        key: "inspect.hover",
        title: "Hover",
        items: [data.sections.hover.data],
        format: (hover) => truncateDisplayText(hover, 240),
        partialReason: observationReason(data.sections.hover),
      }),
    );
  }

  if (input.displayedDefinitions.length > 0) {
    sections.push(
      createToolDisplaySection({
        key: "inspect.definitions",
        title: "Definitions",
        items: input.displayedDefinitions,
        totalCount: input.definitionEvidence?.metadata.totalCount,
        omittedCount: input.definitionEvidence?.metadata.omittedCount,
        partialReason: input.definitionEvidence?.metadata.partialReason,
        format: (definition) => `${definition.file}:${definition.line}:${definition.character}`,
      }),
    );
  }

  if (input.displayedDiagnostics.length > 0) {
    sections.push(
      createToolDisplaySection({
        key: "inspect.diagnostics",
        title: "Diagnostics",
        items: input.displayedDiagnostics,
        totalCount: input.diagnosticEvidence?.metadata.totalCount,
        omittedCount: input.diagnosticEvidence?.metadata.omittedCount,
        partialReason: input.diagnosticEvidence?.metadata.partialReason,
        format: (diagnostic) =>
          `L${diagnostic.line}:${diagnostic.character} ${formatDiagnosticSeverity(diagnostic.severity)}: ${truncateDisplayText(diagnostic.message, 200)}`,
      }),
    );
  }

  return sections;
}

function observationReason<T>(observation: InspectObservation<T>): string | null {
  return observation.kind === "partial" ? observation.reason : null;
}

function formatDiagnosticSeverity(severity: number): string {
  switch (severity) {
    case 1:
      return "Error";
    case 2:
      return "Warning";
    case 3:
      return "Info";
    case 4:
      return "Hint";
    default:
      return "Diagnostic";
  }
}

function listEvidence<T>(
  key: string,
  observation: InspectObservation<readonly T[]>,
  maxResults: number,
): EvidenceList<T> | null {
  if (observation.kind === "unavailable") return null;
  const params = { key, items: [...observation.data], maxResults };
  return observation.kind === "partial"
    ? createPartialEvidenceList({ ...params, partialReason: "provider-limited" })
    : createEvidenceList(params);
}

function inspectResultSections(data: InspectResultData): ResultSection[] {
  const structural = [{ source: "structural" as const, capability: "tree-sitter" }];
  const semantic = [{ source: "semantic" as const, capability: "LSP" }];
  return [
    resultSection("inspect.node", "Syntax node", data.sections.node, structural),
    resultSection(
      "inspect.enclosingSymbol",
      "Enclosing symbol",
      data.sections.enclosingSymbol,
      structural,
    ),
    resultSection("inspect.hover", "Hover", data.sections.hover, semantic),
    resultSection("inspect.definition", "Definition", data.sections.definition, semantic),
    resultSection("inspect.diagnostics", "Nearby diagnostics", data.sections.diagnostics, semantic),
  ];
}

function resultSection<T>(
  key: string,
  title: string,
  observation: InspectObservation<T>,
  provenance: ResultProvenance[],
): ResultSection {
  return {
    key,
    title,
    status: observationStatus(observation),
    items: observation.kind === "unavailable" ? [] : observationItems(observation.data),
    confidence: provenance[0]?.source === "semantic" ? "semantic" : "structural",
    provenance: observation.kind === "unavailable" ? [] : provenance,
  };
}

function observationItems(data: unknown): readonly unknown[] {
  if (data === null) return [];
  return Array.isArray(data) ? data : [data];
}

function observationStatus(
  observation: InspectObservation<unknown>,
): "complete" | "partial" | "unavailable" {
  if (observation.kind === "completed") return "complete";
  return observation.kind;
}

function inspectSectionDetails(data: InspectResultData): InspectSectionDetails[] {
  return [
    sectionDetails("node", "Syntax node", data.sections.node, {
      confidence: "structural",
      capability: "tree-sitter",
    }),
    sectionDetails("enclosingSymbol", "Enclosing symbol", data.sections.enclosingSymbol, {
      confidence: "structural",
      capability: "tree-sitter",
    }),
    sectionDetails("hover", "Hover", data.sections.hover, {
      confidence: "semantic",
      capability: "LSP",
    }),
    sectionDetails("definition", "Definition", data.sections.definition, {
      confidence: "semantic",
      capability: "LSP",
    }),
    sectionDetails("diagnostics", "Nearby diagnostics", data.sections.diagnostics, {
      confidence: "semantic",
      capability: "LSP",
    }),
  ];
}

function sectionDetails<T>(
  key: InspectSectionDetails["key"],
  title: string,
  observation: InspectObservation<T>,
  source: { confidence: ConfidenceMode; capability: string },
): InspectSectionDetails {
  return {
    key,
    title,
    status: observationStatus(observation),
    reason: observation.kind === "completed" ? null : observation.reason,
    itemCount: observation.kind === "unavailable" ? 0 : observationItems(observation.data).length,
    confidence: source.confidence,
    provenance:
      observation.kind === "unavailable"
        ? []
        : [
            {
              source: source.confidence === "semantic" ? "semantic" : "structural",
              capability: source.capability,
            },
          ],
  };
}

function overallProvenance(data: InspectResultData): ResultProvenance[] {
  const structural =
    data.sections.node.kind !== "unavailable" ||
    data.sections.enclosingSymbol.kind !== "unavailable";
  const semantic =
    data.sections.hover.kind !== "unavailable" ||
    data.sections.definition.kind !== "unavailable" ||
    data.sections.diagnostics.kind !== "unavailable";
  return [
    ...(semantic ? [{ source: "semantic" as const, capability: "LSP" }] : []),
    ...(structural ? [{ source: "structural" as const, capability: "tree-sitter" }] : []),
  ];
}

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { inspectErrorResult } from "../result/errors.ts";
import { renderInspectResult } from "./markdown.ts";

type InspectOutcome = Awaited<ReturnType<CodeIntelToolExecCtx["session"]["inspect"]>>;

/** Assemble the final model-visible code_inspect result for one workflow outcome. */
export function finishInspectResult(outcome: InspectOutcome): CodeIntelResult {
  if (outcome.kind === "unavailable") throw new Error(outcome.reason);
  if (outcome.kind === "invalid-input") {
    return inspectErrorResult(`**Error:** ${outcome.message}`, {
      focusTarget: "invalid input",
      nextQueries: ["Provide an existing file and exact 1-based point"],
      message: outcome.message,
    });
  }

  const assembly = assembleInspectResult(outcome.data, outcome.nextQueries);
  return {
    content: renderInspectResult(assembly),
    details: {
      type: "inspect",
      data: assembly.details,
      status: "completed",
      displaySections: assembly.displaySections,
    },
  };
}
