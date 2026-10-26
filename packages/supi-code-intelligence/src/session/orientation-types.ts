import type {
  CodeRequestControl,
  ConfidenceMode,
  SourceRange,
} from "@mrclrchtr/supi-code-runtime/api";
import type { WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import type { ArchitectureModel } from "../analysis/architecture/model.ts";
import type { EvidenceListMetadata } from "../analysis/evidence.ts";
import type { InstructionFilesMetadata } from "../analysis/instruction-files.ts";
import type { CodeProvider } from "../analysis/provider.ts";
import type { ReadNextItem } from "../analysis/read-next.ts";
import type { TargetCandidateCompleteness } from "../analysis/target/types.ts";
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

/** Section keys the Orientation evidence collector gathers for a precise target. */
export type OrientationSection = "defs" | "docs" | "diagnostics";

/** Input to the Orientation evidence collector. */
export interface OrientationInput {
  /** Resolved target entry, consumed read-only; absent for context orientation. */
  target?: Readonly<TargetStoreEntry> | null;
  /** Resolved orientation focus path for project/module/directory/file orientation. */
  focus?: string;
  maxResults?: number;
}

/** Capabilities the Orientation evidence collector requires. */
export interface OrientationDeps {
  readonly model: ArchitectureModel;
  readonly provider: CodeProvider | null;
  readonly cwd: string;
  readonly lspRuntime: WorkspaceLspRuntimeState;
  /** Typed reason to surface when target semantic readiness timed out. */
  readonly semanticReadinessReason?: string;
  readonly requestControl?: CodeRequestControl;
}

/**
 * Presentation-neutral content atom a collector emits for one Orientation
 * section. Collectors never build headings, section notes, or document
 * framing — the markdown adapter owns all of that. `subheading` renders as an
 * h3 within a section (only instruction-file paths use it).
 */
export type OrientationItem =
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "list-item"; readonly text: string }
  | { readonly kind: "subheading"; readonly text: string }
  | {
      readonly kind: "code";
      readonly language: string | null;
      readonly lines: readonly string[];
    }
  | { readonly kind: "blank" }
  | {
      readonly kind: "table";
      readonly headers: readonly string[];
      readonly rows: readonly (readonly string[])[];
    };

/** Source that established one Orientation section. */
export interface OrientationProvenance {
  readonly source:
    | "semantic"
    | "structural"
    | "filesystem"
    | "manifest"
    | "configuration"
    | "runtime";
  readonly capability?: string;
  readonly detail?: string;
}

/** Independently collected Orientation section and its evidence metadata. */
export interface OrientationSectionData {
  readonly key: string;
  readonly title: string;
  readonly status: "complete" | "partial" | "unavailable";
  readonly reason: string | null;
  /** Syntax recovery ranges for partial structural evidence, in 0-based coordinates. */
  readonly errorRanges?: readonly SourceRange[];
  /** Semantic/structural confidence only; filesystem/config facts use unavailable. */
  readonly confidence: ConfidenceMode;
  readonly provenance: readonly OrientationProvenance[];
  readonly evidenceLists: readonly EvidenceListMetadata[];
  /** Evidence list counted by table rows, including when only empty-result framing remains. */
  readonly tableEvidenceKey?: string;
  /** Content atoms for this section; the adapter frames them under the title + note. */
  readonly items: readonly OrientationItem[];
}

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
  /** Document title rendered as the leading h1 (e.g. "Workspace Orientation", "Code Orientation"). */
  readonly title: string;
  /** Leading paragraphs rendered before the title (target summary / resolution notes). */
  readonly notes: readonly string[];
  readonly sections: readonly OrientationSectionData[];
  readonly confidence: ConfidenceMode;
  readonly focusTarget: string | null;
  readonly requestedSections: readonly string[];
  readonly renderedSections: readonly string[];
  readonly omittedCount: number;
  readonly nextQueries: readonly string[];
  readonly readNext: readonly ReadNextItem[];
  readonly instructions?: InstructionFilesMetadata;
  /** Captured generic workspace facts; absent for the unchanged file and symbol paths. */
  readonly workspace?: import("./orientation/workspace-context.ts").WorkspaceOrientationFacts;
  readonly target?: Readonly<TargetStoreEntry>;
}

export type OrientationWorkflowOutcome =
  | { readonly kind: "completed"; readonly data: OrientationResultData }
  | ({
      readonly kind: "disambiguation";
      readonly candidates: readonly OrientationCandidate[];
    } & TargetCandidateCompleteness)
  | ({
      readonly kind: "kind-mismatch";
      readonly requestedKind: TargetSymbolKind;
      readonly candidates: readonly OrientationCandidate[];
    } & TargetCandidateCompleteness)
  | {
      readonly kind: "invalid-input";
      readonly message: string;
      /** No-follow facts for actionable explicit-focus guidance; never a resolved retry path. */
      readonly symlinkRejection?: {
        readonly requestedPath: string;
        readonly blockedPath: string;
      };
    }
  | { readonly kind: "unavailable"; readonly reason: string };
