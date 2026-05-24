// Tree-sitter tool specs for the umbrella package.

import type { TreeSitterService } from "@mrclrchtr/supi-tree-sitter/api";
import { Type } from "typebox";
import {
  executeCallees,
  executeExports,
  executeImports,
  executeNodeAt,
  executeOutline,
  executeQuery,
} from "./tool-actions.ts";

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

export const TS_TOOL_NAMES = [
  "tree_sitter_outline",
  "tree_sitter_imports",
  "tree_sitter_exports",
  "tree_sitter_node_at",
  "tree_sitter_query",
  "tree_sitter_callees",
] as const;

export type TsToolName = (typeof TS_TOOL_NAMES)[number];

export interface TsToolSpec {
  name: TsToolName;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  paramSchemaKey: ParamSchemaKey;
  run: (
    service: TreeSitterService,
    file: string,
    params: Record<string, unknown>,
  ) => Promise<string>;
}

export const TS_TOOL_SPECS: readonly TsToolSpec[] = [
  {
    name: "tree_sitter_outline",
    label: "Tree-sitter Outline",
    description: "Shallow JS/TS outline of top-level declarations and supported members.",
    promptSnippet: "tree_sitter_outline — quick JS/TS outline",
    promptGuidelines: ["Use tree_sitter_outline(file) for a quick JS/TS outline."],
    paramSchemaKey: "fileOnly",
    run: (service, file) => executeOutline(service, file),
  },
  {
    name: "tree_sitter_imports",
    label: "Tree-sitter Imports",
    description: "List imports in a JS/TS file.",
    promptSnippet: "tree_sitter_imports — JS/TS imports",
    promptGuidelines: ["Use tree_sitter_imports(file) to inspect JS/TS dependencies."],
    paramSchemaKey: "fileOnly",
    run: (service, file) => executeImports(service, file),
  },
  {
    name: "tree_sitter_exports",
    label: "Tree-sitter Exports",
    description: "List exports in a JS/TS file.",
    promptSnippet: "tree_sitter_exports — JS/TS exports",
    promptGuidelines: ["Use tree_sitter_exports(file) to inspect JS/TS exports."],
    paramSchemaKey: "fileOnly",
    run: (service, file) => executeExports(service, file),
  },
  {
    name: "tree_sitter_node_at",
    label: "Tree-sitter Node At",
    description: "Show the syntax node and ancestry at a file position.",
    promptSnippet: "tree_sitter_node_at — syntax node at a position",
    promptGuidelines: ["Use tree_sitter_node_at(file,line,character) for the exact syntax node."],
    paramSchemaKey: "fileLineChar",
    run: (service, _file, params) =>
      executeNodeAt(service, String(params.file), Number(params.line), Number(params.character)),
  },
  {
    name: "tree_sitter_query",
    label: "Tree-sitter Query",
    description: "Run a custom Tree-sitter query against a file.",
    promptSnippet: "tree_sitter_query — custom AST query",
    promptGuidelines: ["Use tree_sitter_query(file,query) for custom AST matching."],
    paramSchemaKey: "fileQuery",
    run: (service, _file, params) =>
      executeQuery(service, String(params.file), String(params.query)),
  },
  {
    name: "tree_sitter_callees",
    label: "Tree-sitter Callees",
    description: "List outgoing callees from the enclosing scope at a file position.",
    promptSnippet: "tree_sitter_callees — outgoing callees",
    promptGuidelines: ["Use tree_sitter_callees(file,line,character) for outgoing calls."],
    paramSchemaKey: "fileLineChar",
    run: (service, _file, params) =>
      executeCallees(service, String(params.file), Number(params.line), Number(params.character)),
  },
];
