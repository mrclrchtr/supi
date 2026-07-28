import type { CodeSymbol } from "@mrclrchtr/supi-code-runtime/api";
import type { StructuredPatternResult } from "../analysis/search/pattern.ts";
import type { CodeFindAstKind } from "../tool/find/ast-kinds.ts";
import type { CodeFindMode } from "../tool/find/modes.ts";

export type FindMode = CodeFindMode;

export interface FindWorkflowInput {
  readonly query: string;
  readonly scope?: readonly string[];
  readonly mode: FindMode;
  readonly kind?: CodeFindAstKind;
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
