import type { RefactorResult } from "@mrclrchtr/supi-code-runtime/api";
import type { ApplyResult } from "../analysis/refactor/apply.ts";
import type { RefactorPlan } from "./refactor-plans.ts";
import type { RefactorTargetInput, SourcePointInput } from "./target-input.ts";

/** Public refactor operations exposed by code_refactor_plan. */
export const PUBLIC_REFACTOR_OPERATION_NAMES = [
  "rename_symbol",
  "code_action",
  "source_action",
] as const;

export type PublicRefactorOperationName = (typeof PUBLIC_REFACTOR_OPERATION_NAMES)[number];

/** One-based public source range; the end is exclusive. */
export interface PublicSourceRange {
  readonly start: Omit<SourcePointInput, "file">;
  readonly end: Omit<SourcePointInput, "file">;
}

/**
 * One refactor operation with its own scope. Only `rename_symbol` needs a
 * symbol target; code and source actions name a file directly.
 */
export type RefactorOperationInput =
  | {
      readonly rename_symbol: {
        readonly target: RefactorTargetInput;
        readonly newName: string;
      };
    }
  | {
      readonly code_action: {
        readonly file: string;
        readonly range: PublicSourceRange;
        /** CodeActionKind prefix under `refactor`. */
        readonly kind: string;
        /** Exact action title that selects one matching action. */
        readonly title?: string;
      };
    }
  | {
      readonly source_action: {
        readonly file: string;
        /** CodeActionKind prefix under `source`. */
        readonly kind: string;
        /** Exact action title that selects one matching action. */
        readonly title?: string;
      };
    };

export interface RefactorPlanWorkflowInput {
  readonly operation: RefactorOperationInput;
}

export type RefactorPlanWorkflowOutcome =
  | { readonly kind: "completed"; readonly plan: Readonly<RefactorPlan> }
  | {
      readonly kind: "ambiguous";
      readonly candidates: Readonly<Extract<RefactorResult, { kind: "ambiguous" }>["candidates"]>;
    }
  | { readonly kind: "invalid-input"; readonly message: string }
  | { readonly kind: "unavailable"; readonly reason: string };

export interface RefactorApplyWorkflowInput {
  readonly planId: string;
}

export type RefactorApplyWorkflowOutcome =
  | {
      readonly kind: "completed";
      readonly plan: Readonly<RefactorPlan>;
      readonly result: Readonly<Extract<ApplyResult, { kind: "applied" }>>;
    }
  | { readonly kind: "invalid-input"; readonly message: string }
  | { readonly kind: "unavailable"; readonly reason: string };
