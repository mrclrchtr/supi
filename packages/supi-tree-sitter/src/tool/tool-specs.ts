/**
 * Single source of truth for the split `tree_sitter_*` tool surface.
 *
 * Tool registration, guidance, and parameter validation should derive
 * from these specs so the public surface does not drift from the
 * metadata that drives it.
 */

import { Type } from "typebox";

// ── Shared parameter fragments ─────────────────────────────────────────

const FileParam = Type.String({ description: "File path (relative or absolute)" });
const LineParam = Type.Number({ description: "1-based line number", minimum: 1 });
const CharacterParam = Type.Number({
  description: "1-based character column (UTF-16)",
  minimum: 1,
});
const QueryParam = Type.String({ description: "Tree-sitter query string" });

export const PARAM_SCHEMAS = {
  fileOnly: Type.Object({ file: FileParam }, { additionalProperties: false }),
  fileLineChar: Type.Object(
    { file: FileParam, line: LineParam, character: CharacterParam },
    { additionalProperties: false },
  ),
  fileQuery: Type.Object({ file: FileParam, query: QueryParam }, { additionalProperties: false }),
} as const;

export type ParamSchemaKey = keyof typeof PARAM_SCHEMAS;

// ── Tool names ─────────────────────────────────────────────────────────

export const TREE_SITTER_TOOL_NAMES = [
  "tree_sitter_outline",
  "tree_sitter_imports",
  "tree_sitter_exports",
  "tree_sitter_node_at",
  "tree_sitter_query",
  "tree_sitter_callees",
] as const;

export type TreeSitterToolName = (typeof TREE_SITTER_TOOL_NAMES)[number];

// ── Per-tool metadata ──────────────────────────────────────────────────

export interface TreeSitterToolSpec {
  name: TreeSitterToolName;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  paramSchemaKey: ParamSchemaKey;
}

export const TREE_SITTER_TOOL_SPECS: readonly TreeSitterToolSpec[] = [
  {
    name: "tree_sitter_outline",
    label: "Tree-sitter Outline",
    description:
      "Shallow structural outline of declarations in JavaScript/TypeScript files. " +
      "Returns top-level declarations plus supported class/interface/enum members.",
    promptSnippet: "tree_sitter_outline — shallow outline for Js/Ts files",
    promptGuidelines: [
      "Use tree_sitter_outline(file) for shallow JavaScript or TypeScript structure without reading the whole file.",
    ],
    paramSchemaKey: "fileOnly",
  },
  {
    name: "tree_sitter_imports",
    label: "Tree-sitter Imports",
    description:
      "List all imports in a JavaScript/TypeScript file. " +
      "Returns each import's module specifier and source location.",
    promptSnippet: "tree_sitter_imports — list imports for Js/Ts files",
    promptGuidelines: [
      "Use tree_sitter_imports(file) to see module dependencies in JavaScript or TypeScript files.",
    ],
    paramSchemaKey: "fileOnly",
  },
  {
    name: "tree_sitter_exports",
    label: "Tree-sitter Exports",
    description:
      "List all exports in a JavaScript/TypeScript file. " +
      "Returns each export's kind, name, module specifier (if re-exported), and source location.",
    promptSnippet: "tree_sitter_exports — list exports for Js/Ts files",
    promptGuidelines: [
      "Use tree_sitter_exports(file) for interface or export inspection in JavaScript or TypeScript files.",
    ],
    paramSchemaKey: "fileOnly",
  },
  {
    name: "tree_sitter_node_at",
    label: "Tree-sitter Node At",
    description:
      "Find the exact syntax node and its ancestry at a given position in a file. " +
      "Works across all supported grammars.",
    promptSnippet: "tree_sitter_node_at — exact syntax node and ancestry at a known position",
    promptGuidelines: [
      "Use tree_sitter_node_at(file, line, character) for the exact syntax node and ancestry at a known position.",
    ],
    paramSchemaKey: "fileLineChar",
  },
  {
    name: "tree_sitter_query",
    label: "Tree-sitter Query",
    description:
      "Run a custom Tree-sitter query against a file. " +
      "Supports all grammars tree-sitter can parse.",
    promptSnippet: "tree_sitter_query — custom AST pattern matching across all supported grammars",
    promptGuidelines: [
      "Use tree_sitter_query(file, query) for custom Tree-sitter patterns when the built-in actions are not specific enough.",
    ],
    paramSchemaKey: "fileQuery",
  },
  {
    name: "tree_sitter_callees",
    label: "Tree-sitter Callees",
    description:
      "List outgoing function/method callees from the enclosing scope at a given position. " +
      "Works for many supported grammars.",
    promptSnippet:
      "tree_sitter_callees — outgoing calls from a function or method at a known position",
    promptGuidelines: [
      "Use tree_sitter_callees(file, line, character) for outgoing calls from the enclosing function or method at a known position.",
    ],
    paramSchemaKey: "fileLineChar",
  },
];

// ── Lookup helpers ─────────────────────────────────────────────────────

const TREE_SITTER_TOOL_SPEC_MAP = new Map<TreeSitterToolName, TreeSitterToolSpec>(
  TREE_SITTER_TOOL_SPECS.map((spec) => [spec.name, spec]),
);

export function getTreeSitterToolSpec(toolName: TreeSitterToolName): TreeSitterToolSpec {
  const spec = TREE_SITTER_TOOL_SPEC_MAP.get(toolName);
  if (!spec) throw new Error(`Unknown tree_sitter tool: ${toolName}`);
  return spec;
}
