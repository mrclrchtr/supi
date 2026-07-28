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
} from "./assembly.ts";
import type { InspectDetails, InspectSectionDetails } from "./types.ts";

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

  return {
    data,
    displayedDefinitions: definitionEvidence?.items ?? [],
    displayedDiagnostics: diagnosticEvidence?.items ?? [],
    definitionEvidence,
    diagnosticEvidence,
    assembled,
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
