import type { InspectResultData } from "../../session/inspect-types.ts";
import { assembledNextQueries, assembleToolResult, type ToolResultAssembly } from "./assembly.ts";
import type { InspectDetails } from "./types.ts";

export type { InspectResultData } from "../../session/inspect-types.ts";

/** Assembled inspection evidence consumed by markdown and TUI adapters. */
export interface InspectResultAssembly {
  data: InspectResultData;
  assembled: ToolResultAssembly<InspectResultData>;
  details: InspectDetails;
}

/** Assemble code_inspect evidence/details before presentation adapters render it. */
export function assembleInspectResult(
  data: InspectResultData,
  nextQueries: readonly string[],
): InspectResultAssembly {
  const evidenceLists = data.codeActionEvidence ? [data.codeActionEvidence] : [];
  const provenance = [
    ...(data.confidence === "semantic" ? [{ source: "semantic" as const, capability: "LSP" }] : []),
    ...(data.node ? [{ source: "structural" as const, capability: "tree-sitter" }] : []),
  ];
  const assembled = assembleToolResult({
    data,
    sections: [
      {
        key: "inspect.point",
        title: "Point facts",
        status: data.unavailableSections.length > 0 ? "partial" : "complete",
        items: [data],
        confidence: data.confidence,
        provenance,
      },
    ],
    evidenceLists,
    nextQueries,
    candidateCount: 1,
    confidence: data.confidence,
    provenance,
  });

  return {
    data,
    assembled,
    details: {
      confidence: data.confidence,
      focusTarget: `${data.relPath}:${data.line}:${data.character}`,
      unavailableSections: [...data.unavailableSections],
      evidenceLists: [...assembled.evidenceLists],
      nextQueries: assembledNextQueries(assembled),
    },
  };
}
