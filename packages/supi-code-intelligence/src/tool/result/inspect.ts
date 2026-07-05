import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import type { InspectDetails } from "./types.ts";

export interface InspectResultData {
  relPath: string;
  line: number;
  character: number;
  confidence: ConfidenceMode;
  node: {
    type: string;
    text: string;
    startLine: number;
    startCharacter: number;
    ancestry?: Array<
      | string
      | {
          type: string;
          startLine: number;
          startCharacter: number;
          endLine?: number;
          endCharacter?: number;
        }
    >;
  } | null;
  enclosingSymbol: {
    name: string;
    kind: string;
    startLine: number;
    endLine: number;
  } | null;
  hover: string | null;
  definitions: Array<{ file: string; line: number; character: number }>;
  diagnostics: Array<{ line: number; severity: number | string; message: string }>;
  codeActions: Array<{ title: string; kind?: string }>;
  codeActionEvidence?: EvidenceListMetadata;
  unavailableSections: string[];
}

export interface InspectResultAssembly {
  data: InspectResultData;
  details: InspectDetails;
}

/** Assemble code_inspect evidence/details before presentation adapters render it. */
export function assembleInspectResult(
  data: InspectResultData,
  nextQueries: string[],
): InspectResultAssembly {
  return {
    data,
    details: {
      confidence: data.confidence,
      focusTarget: `${data.relPath}:${data.line}:${data.character}`,
      unavailableSections: data.unavailableSections,
      evidenceLists: data.codeActionEvidence ? [data.codeActionEvidence] : [],
      nextQueries,
    },
  };
}
