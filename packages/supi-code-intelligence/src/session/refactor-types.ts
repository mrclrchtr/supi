import type { RefactorResult } from "@mrclrchtr/supi-code-runtime/api";
import type { ApplyResult } from "../analysis/refactor/apply.ts";
import type { RefactorPlan } from "./refactor-plans.ts";
import type { RefactorTargetInput, SourcePointInput } from "./target-input.ts";

/** Public refactor operations exposed by code_refactor_plan. */
export const PUBLIC_REFACTOR_OPERATION_NAMES = [
  "rename_symbol",
  "extract_function",
  "extract_variable",
  "update_imports",
  "delete_dead_code",
] as const;

export type PublicRefactorOperationName = (typeof PUBLIC_REFACTOR_OPERATION_NAMES)[number];

export interface PublicSourceRange {
  readonly start: Omit<SourcePointInput, "file">;
  readonly end: Omit<SourcePointInput, "file">;
}

export type RefactorOperationInput =
  | { readonly rename_symbol: { readonly newName: string } }
  | {
      readonly extract_function: {
        readonly newName: string;
        readonly range: PublicSourceRange;
      };
    }
  | {
      readonly extract_variable: {
        readonly newName: string;
        readonly range: PublicSourceRange;
      };
    }
  | { readonly update_imports: Record<string, never> }
  | { readonly delete_dead_code: Record<string, never> };

export interface RefactorPlanWorkflowInput {
  readonly target: RefactorTargetInput;
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
