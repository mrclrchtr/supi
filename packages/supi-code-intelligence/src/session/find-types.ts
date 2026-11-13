import type { CodeQueryPartialMetadata, CodeSymbol } from "@mrclrchtr/supi-code-runtime/api";
import type { StructuredPatternResult } from "../analysis/search/pattern.ts";
import type { CodeFindAstKind } from "../tool/code_find/ast-kinds.ts";
import type { CodeFindMode } from "../tool/code_find/modes.ts";

export type FindMode = CodeFindMode;

/** Exactly one search mode; each branch carries only the fields that mode honors. */
export type FindSearchInput =
  | { readonly ast: { readonly kind: CodeFindAstKind; readonly query: string } }
  | { readonly semantic: { readonly query: string } };

/** Canonical code_find workflow input. */
export interface FindWorkflowInput {
  readonly search: FindSearchInput;
  readonly scopes?: readonly string[];
  readonly maxResults?: number;
}

export type FindWorkflowData =
  | {
      readonly kind: "ast";
      readonly astKind: CodeFindAstKind;
      readonly result: Readonly<StructuredPatternResult>;
    }
  | {
      readonly kind: "semantic";
      readonly symbols: readonly CodeSymbol[];
      readonly partialReason: string | null;
      readonly partialMetadata?: CodeQueryPartialMetadata;
    };

export type FindWorkflowOutcome =
  | {
      readonly kind: "completed";
      readonly query: string;
      readonly mode: FindMode;
      readonly scopeLabel: string;
      readonly maxResults: number;
      readonly data: FindWorkflowData;
    }
  | { readonly kind: "invalid-input"; readonly message: string }
  | { readonly kind: "unavailable"; readonly reason: string };
