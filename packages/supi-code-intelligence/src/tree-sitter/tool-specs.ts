// Tree-sitter tool names and specs — owned by the umbrella adapter.
//
// Tool metadata is replicated from supi-tree-sitter's tool-specs.ts to avoid
// importing internal modules. Future cleanup can consolidate.

import { Type } from "typebox";

// ── Shared parameter schemas ──────────────────────────────────────────

const FileParam = Type.String({ description: "File path" });
const LineParam = Type.Number({ description: "1-based line", minimum: 1 });
const CharacterParam = Type.Number({ description: "1-based UTF-16 column", minimum: 1 });
const QueryParam = Type.String({ description: "Tree-sitter query" });

export const PARAM_SCHEMAS = {
  fileOnly: Type.Object({ file: FileParam }, { additionalProperties: false }),
  fileLineChar: Type.Object(
    { file: FileParam, line: LineParam, character: CharacterParam },
    { additionalProperties: false },
  ),
  fileQuery: Type.Object({ file: FileParam, query: QueryParam }, { additionalProperties: false }),
} as const;

export type ParamSchemaKey = keyof typeof PARAM_SCHEMAS;

// ── Tool names ────────────────────────────────────────────────────────

export const TREE_SITTER_TOOL_NAMES = [
  "tree_sitter_outline",
  "tree_sitter_imports",
  "tree_sitter_exports",
  "tree_sitter_node_at",
  "tree_sitter_query",
  "tree_sitter_callees",
] as const;

export type TreeSitterToolName = (typeof TREE_SITTER_TOOL_NAMES)[number];

// ── Tool specs ────────────────────────────────────────────────────────

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
    description: "Shallow JS/TS outline of top-level declarations and supported members.",
    promptSnippet: "tree_sitter_outline — quick JS/TS outline",
    promptGuidelines: ["Use tree_sitter_outline(file) for a quick JS/TS outline."],
    paramSchemaKey: "fileOnly",
  },
  {
    name: "tree_sitter_imports",
    label: "Tree-sitter Imports",
    description: "List imports in a JS/TS file.",
    promptSnippet: "tree_sitter_imports — JS/TS imports",
    promptGuidelines: ["Use tree_sitter_imports(file) to inspect JS/TS dependencies."],
    paramSchemaKey: "fileOnly",
  },
  {
    name: "tree_sitter_exports",
    label: "Tree-sitter Exports",
    description: "List exports in a JS/TS file.",
    promptSnippet: "tree_sitter_exports — JS/TS exports",
    promptGuidelines: ["Use tree_sitter_exports(file) to inspect JS/TS exports."],
    paramSchemaKey: "fileOnly",
  },
  {
    name: "tree_sitter_node_at",
    label: "Tree-sitter Node At",
    description: "Show the syntax node and ancestry at a file position.",
    promptSnippet: "tree_sitter_node_at — syntax node at a position",
    promptGuidelines: ["Use tree_sitter_node_at(file,line,character) for the exact syntax node."],
    paramSchemaKey: "fileLineChar",
  },
  {
    name: "tree_sitter_query",
    label: "Tree-sitter Query",
    description: "Run a custom Tree-sitter query against a file.",
    promptSnippet: "tree_sitter_query — custom AST query",
    promptGuidelines: ["Use tree_sitter_query(file,query) for custom AST matching."],
    paramSchemaKey: "fileQuery",
  },
  {
    name: "tree_sitter_callees",
    label: "Tree-sitter Callees",
    description: "List outgoing callees from the enclosing scope at a file position.",
    promptSnippet: "tree_sitter_callees — outgoing callees",
    promptGuidelines: ["Use tree_sitter_callees(file,line,character) for outgoing calls."],
    paramSchemaKey: "fileLineChar",
  },
];
