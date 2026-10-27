import type { SourceRange } from "@mrclrchtr/supi-code-runtime/api";

/** Named, selected observations retained independently of their text rendering. */
export interface OrientationFacts {
  readonly fileSizeBytes?: number;
  readonly package?: {
    readonly name: string | null;
    readonly description: string | null;
    readonly manifestPath: string;
    readonly directory: string;
  };
  readonly manifestFields?: readonly { readonly field: string; readonly value: unknown }[];
  readonly dependencies?: readonly {
    readonly field: string;
    readonly name: string;
    readonly value: unknown;
  }[];
  readonly relationships?: readonly {
    readonly from: string;
    readonly to: string;
    readonly field: string;
    readonly manifestPath: string;
    readonly value: unknown;
  }[];
  readonly outline?: readonly {
    readonly name: string;
    readonly kind: string;
    readonly startLine: number;
    readonly startCharacter: number;
    readonly endLine: number;
    readonly endCharacter: number;
  }[];
  readonly imports?: readonly {
    readonly moduleSpecifier: string;
    readonly startLine: number;
    readonly startCharacter: number;
    readonly endLine: number;
    readonly endCharacter: number;
  }[];
  readonly exports?: readonly {
    readonly name: string;
    readonly kind: string;
    readonly startLine: number;
    readonly startCharacter: number;
    readonly endLine: number;
    readonly endCharacter: number;
    readonly moduleSpecifier?: string;
  }[];
  readonly diagnosticSnapshot?: readonly {
    readonly file: string;
    readonly total: number;
    readonly errors: number;
    readonly warnings: number;
  }[];
  readonly snapshotCurrent?: boolean;
  readonly node?: {
    readonly type: string;
    readonly text: string;
    readonly startLine: number;
    readonly startCharacter: number;
    readonly endLine: number;
    readonly endCharacter: number;
    readonly ancestry: readonly {
      readonly type: string;
      readonly startLine: number;
      readonly startCharacter: number;
      readonly endLine: number;
      readonly endCharacter: number;
    }[];
  } | null;
  /** Distinguish position-strict withholding, failure, and successful observations. */
  readonly nodeObservation?: import("./gather.ts").ContextObservationStatus;
  readonly hover?: { readonly contents: string; readonly range?: SourceRange } | null;
  readonly hoverObservation?: import("./gather.ts").ContextObservationStatus;
  readonly definitions?: readonly { readonly file: string; readonly range: SourceRange }[];
  /** Independent context query; unavailable observations have no manufactured entries or counts. */
  readonly contextDefinitions?: import("./gather.ts").ContextObservationStatus & {
    readonly entries?: readonly { readonly uri: string; readonly range: SourceRange }[];
    readonly collectedCount?: number;
    readonly omittedCount?: number;
  };
  readonly recovery?: readonly {
    readonly operation: string;
    readonly file: string;
    readonly reason: string;
    readonly errorRanges: readonly SourceRange[];
  }[];
  readonly sourceContext?: {
    readonly outline: {
      readonly status: "complete" | "partial" | "unavailable";
      readonly reason: string | null;
      readonly entries: readonly {
        readonly name: string;
        readonly kind: string;
        readonly startLine: number;
        readonly endLine: number;
      }[];
      readonly collectedCount: number;
      readonly omittedCount: number;
    };
    readonly imports: {
      readonly status: "complete" | "partial" | "unavailable";
      readonly reason: string | null;
      readonly entries: readonly { readonly moduleSpecifier: string }[];
      readonly collectedCount: number;
      readonly omittedCount: number;
    };
    readonly exports: {
      readonly status: "complete" | "partial" | "unavailable";
      readonly reason: string | null;
      readonly entries: readonly { readonly name: string; readonly kind: string }[];
      readonly collectedCount: number;
      readonly omittedCount: number;
    };
  };
  readonly documentation?: readonly string[];
  readonly diagnostics?: readonly {
    readonly range: SourceRange;
    readonly severity: number | null;
    readonly message: string;
    readonly source: string | null;
    readonly code: string | number | null;
  }[];
}
