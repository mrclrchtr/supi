import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { InstructionFilesMetadata } from "../analysis/instruction-files.ts";
import type { ReadNextItem } from "../analysis/read-next.ts";
import type { OrientationTargetInput, TargetSymbolKind } from "./target-input.ts";
import type { AnchorKind, TargetStoreEntry } from "./target-store.ts";

/** Exact-one non-workspace Orientation focus. */
export type OrientationFocusInput =
  | { readonly path: string }
  | { readonly module: string }
  | { readonly target: OrientationTargetInput };

export interface OrientationWorkflowInput {
  readonly focus?: OrientationFocusInput;
  readonly maxResults?: number;
}

/** Presentation-neutral block collected for an Orientation result. */
export type OrientationBlock =
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "list-item"; readonly text: string }
  | {
      readonly kind: "code";
      readonly language: string | null;
      readonly lines: readonly string[];
    }
  | { readonly kind: "blank" };

export interface OrientationCandidate {
  readonly targetId: string;
  readonly name: string;
  readonly kind: string | null;
  readonly container: string | null;
  readonly file: string;
  readonly line: number;
  readonly character: number;
  readonly rank: number;
  readonly anchorKind?: AnchorKind;
}

/** Immutable facts returned by the session before markdown or TUI rendering. */
export interface OrientationResultData {
  readonly blocks: readonly OrientationBlock[];
  readonly confidence: ConfidenceMode;
  readonly focusTarget: string | null;
  readonly requestedSections: readonly string[];
  readonly renderedSections: readonly string[];
  readonly omittedCount: number;
  readonly nextQueries: readonly string[];
  readonly readNext: readonly ReadNextItem[];
  readonly instructions?: InstructionFilesMetadata;
  readonly target?: Readonly<TargetStoreEntry>;
}

export type OrientationWorkflowOutcome =
  | { readonly kind: "completed"; readonly data: OrientationResultData }
  | {
      readonly kind: "disambiguation";
      readonly candidates: readonly OrientationCandidate[];
      readonly omittedCount: number;
    }
  | {
      readonly kind: "kind-mismatch";
      readonly requestedKind: TargetSymbolKind;
      readonly candidates: readonly OrientationCandidate[];
      readonly omittedCount: number;
    }
  | { readonly kind: "invalid-input"; readonly message: string }
  | { readonly kind: "unavailable"; readonly reason: string };
