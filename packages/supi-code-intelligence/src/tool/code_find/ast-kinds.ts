/** Canonical public AST-kind vocabulary for code_find. */
export const CODE_FIND_AST_KINDS = [
  "definition",
  "import",
  "export",
  "call",
  "type",
  "interface",
  "class",
  "method",
  "enum",
] as const;

/** One supported code_find AST search kind. */
export type CodeFindAstKind = (typeof CODE_FIND_AST_KINDS)[number];

const CODE_FIND_AST_KIND_SET = new Set<string>(CODE_FIND_AST_KINDS);

/** Return whether a direct caller supplied a supported code_find AST kind. */
export function isCodeFindAstKind(value: unknown): value is CodeFindAstKind {
  return typeof value === "string" && CODE_FIND_AST_KIND_SET.has(value);
}

/** Exhaustive presentation labels keyed by the canonical AST-kind vocabulary. */
export const CODE_FIND_AST_KIND_LABELS = {
  definition: "Definitions",
  import: "Imports",
  export: "Exports",
  call: "Calls",
  type: "Types",
  interface: "Interfaces",
  class: "Classes",
  method: "Methods",
  enum: "Enums",
} as const satisfies Record<CodeFindAstKind, string>;
