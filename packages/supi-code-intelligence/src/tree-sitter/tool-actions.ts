// Tree-sitter tool execution adapters — delegates to the family execute module.
//
// All formatting lives in src/tool/families/tree-sitter/format.ts.
// The library @mrclrchtr/supi-tree-sitter/api exposes only structured runtime APIs.

import type { TreeSitterRuntime } from "@mrclrchtr/supi-tree-sitter/api";
import {
  handleCallees,
  handleExports,
  handleImports,
  handleNodeAt,
  handleOutline,
  handleQuery,
} from "./execute.ts";

/** Execute a tree-sitter tool by name against a runtime. */
export async function executeTsTool(
  toolName: string,
  runtime: TreeSitterRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const file = String(params.file);

  switch (toolName) {
    case "tree_sitter_outline":
      return handleOutline(runtime, file);
    case "tree_sitter_imports":
      return handleImports(runtime, file);
    case "tree_sitter_exports":
      return handleExports(runtime, file);
    case "tree_sitter_node_at":
      return handleNodeAt(runtime, file, Number(params.line), Number(params.character));
    case "tree_sitter_query":
      return handleQuery(runtime, file, String(params.query));
    case "tree_sitter_callees":
      return handleCallees(runtime, file, Number(params.line), Number(params.character));
    default:
      return `Unknown tree_sitter tool: ${toolName}`;
  }
}
