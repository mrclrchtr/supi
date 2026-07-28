import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { SourcePointInput } from "./target-input.ts";

/** Canonical code_inspect workflow input. */
export interface InspectWorkflowInput {
  readonly point: SourcePointInput;
  readonly maxResults?: number;
}

/** Presentation-neutral point inspection facts. */
export interface InspectResultData {
  readonly relPath: string;
  readonly line: number;
  readonly character: number;
  readonly confidence: ConfidenceMode;
  readonly node: {
    readonly type: string;
    readonly text: string;
    readonly startLine: number;
    readonly startCharacter: number;
    readonly ancestry?: ReadonlyArray<
      | string
      | {
          readonly type: string;
          readonly startLine: number;
          readonly startCharacter: number;
          readonly endLine?: number;
          readonly endCharacter?: number;
        }
    >;
  } | null;
  readonly enclosingSymbol: {
    readonly name: string;
    readonly kind: string;
    readonly startLine: number;
    readonly endLine: number;
  } | null;
  readonly hover: string | null;
  readonly definitions: ReadonlyArray<{ file: string; line: number; character: number }>;
  readonly diagnostics: ReadonlyArray<{ line: number; severity: number | string; message: string }>;
  readonly unavailableSections: readonly string[];
}

export type InspectWorkflowOutcome =
  | {
      readonly kind: "completed";
      readonly data: InspectResultData;
      readonly nextQueries: readonly string[];
    }
  | { readonly kind: "invalid-input"; readonly message: string }
  | { readonly kind: "unavailable"; readonly reason: string };
