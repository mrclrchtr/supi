import type { CodeQueryResult, ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { SourcePointInput } from "./target-input.ts";

/** Canonical code_inspect workflow input. */
export interface InspectWorkflowInput {
  readonly point: SourcePointInput;
  readonly maxResults?: number;
}

export type InspectObservation<T> = CodeQueryResult<T>;

export interface InspectNode {
  readonly type: string;
  readonly text: string;
  readonly startLine: number;
  readonly startCharacter: number;
  readonly endLine: number;
  readonly endCharacter: number;
  readonly ancestry: ReadonlyArray<{
    readonly type: string;
    readonly startLine: number;
    readonly startCharacter: number;
    readonly endLine: number;
    readonly endCharacter: number;
  }>;
}

export interface InspectEnclosingSymbol {
  readonly name: string;
  readonly kind: string;
  readonly startLine: number;
  readonly startCharacter: number;
  readonly endLine: number;
  readonly endCharacter: number;
}

export interface InspectDefinition {
  readonly file: string;
  readonly line: number;
  readonly character: number;
}

export interface InspectDiagnostic {
  readonly line: number;
  readonly character: number;
  readonly endLine: number;
  readonly endCharacter: number;
  readonly severity: number;
  readonly message: string;
}

export interface InspectSections {
  readonly node: InspectObservation<InspectNode | null>;
  readonly enclosingSymbol: InspectObservation<InspectEnclosingSymbol | null>;
  readonly hover: InspectObservation<string | null>;
  readonly definition: InspectObservation<readonly InspectDefinition[]>;
  readonly diagnostics: InspectObservation<readonly InspectDiagnostic[]>;
}

/** Presentation-neutral point inspection facts and per-section collection state. */
export interface InspectResultData {
  readonly relPath: string;
  readonly line: number;
  readonly character: number;
  readonly maxResults: number;
  readonly confidence: ConfidenceMode;
  readonly diagnosticWindow: { readonly startLine: number; readonly endLine: number };
  readonly sections: InspectSections;
}

export type InspectWorkflowOutcome =
  | {
      readonly kind: "completed";
      readonly data: InspectResultData;
      readonly nextQueries: readonly string[];
    }
  | { readonly kind: "invalid-input"; readonly message: string }
  | { readonly kind: "unavailable"; readonly reason: string };
