import type { CodeSymbol } from "@mrclrchtr/supi-code-runtime/api";
import type { StructuredPatternResult } from "../analysis/search/pattern.ts";
import type { RgMatch } from "../analysis/search/ripgrep.ts";
import type { CodeFindAstKind } from "../tool/find/ast-kinds.ts";

export type FindMode = "text" | "regex" | "ast" | "semantic";

export interface FindWorkflowInput {
  readonly query: string;
  readonly scope?: readonly string[];
  readonly mode?: FindMode;
  readonly kind?: CodeFindAstKind;
  readonly contextLines?: number;
  readonly maxResults?: number;
}

export type FindWorkflowData =
  | {
      readonly kind: "text" | "regex";
      readonly matches: readonly RgMatch[];
      /** Present when ripgrep stopped before it could enumerate all matches. */
      readonly partialReason?: "timeout";
    }
  | {
      readonly kind: "ast";
      readonly astKind: CodeFindAstKind;
      readonly result: Readonly<StructuredPatternResult>;
    }
  | { readonly kind: "semantic"; readonly symbols: readonly CodeSymbol[] };

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
