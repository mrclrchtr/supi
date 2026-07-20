/** Canonical target values accepted by the Workspace code-intelligence session. */

/** A 1-based source point supplied by a public code-intelligence tool. */
export interface SourcePointInput {
  readonly file: string;
  readonly line: number;
  readonly character: number;
}

/** Exact LSP SymbolKind vocabulary accepted by semantic target discovery. */
export const TARGET_SYMBOL_KINDS = [
  "file",
  "module",
  "namespace",
  "package",
  "class",
  "method",
  "property",
  "field",
  "constructor",
  "enum",
  "interface",
  "function",
  "variable",
  "constant",
  "string",
  "number",
  "boolean",
  "array",
  "object",
  "key",
  "null",
  "enumMember",
  "struct",
  "event",
  "operator",
  "typeParameter",
] as const;

/** Provider-reported symbol kind used as a strict semantic filter. */
export type TargetSymbolKind = (typeof TARGET_SYMBOL_KINDS)[number];

/** A semantic symbol query and its optional workspace-relative scope. */
export interface SymbolTargetInput {
  readonly query: string;
  readonly scope?: string;
  readonly symbolKind?: TargetSymbolKind;
}

/** Session-scoped target handle returned by code_resolve. */
export interface HandleTargetInput {
  readonly handle: string;
}

/** Provider-backed source anchor. */
export interface AnchorTargetInput {
  readonly anchor: SourcePointInput;
}

/** Semantic symbol selector. */
export interface SymbolTargetSelectorInput {
  readonly symbol: SymbolTargetInput;
}

/** File-level selector. */
export interface FileTargetInput {
  readonly file: string;
}

/** Canonical exact-one target selector. */
export type TargetInput =
  | HandleTargetInput
  | AnchorTargetInput
  | SymbolTargetSelectorInput
  | FileTargetInput;

/** Target variants accepted by code_resolve. */
export type ResolveTargetInput = AnchorTargetInput | SymbolTargetSelectorInput | FileTargetInput;

/** Target variants accepted by code_graph. */
export type GraphTargetInput = HandleTargetInput | AnchorTargetInput | SymbolTargetSelectorInput;

/** Target variants accepted by precise Orientation focus. */
export type OrientationTargetInput =
  | HandleTargetInput
  | AnchorTargetInput
  | SymbolTargetSelectorInput;

/** Target variants accepted by code_refactor_plan. */
export type RefactorTargetInput = HandleTargetInput | AnchorTargetInput;

/** Return the selected target branch. Public schemas guarantee exactly one branch. */
export function targetInputKind(input: TargetInput): "handle" | "anchor" | "symbol" | "file" {
  if ("handle" in input) return "handle";
  if ("anchor" in input) return "anchor";
  if ("symbol" in input) return "symbol";
  return "file";
}
