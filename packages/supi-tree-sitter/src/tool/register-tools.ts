// Focused tool registration for the tree_sitter extension.
//
// Derives tool metadata, schemas, and prompt surfaces from tool-specs.ts.
// Handler functions from ./handlers.ts do the actual work.

import type { AgentToolResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TreeSitterRuntime } from "../session/runtime.ts";
import {
  handleCallees,
  handleExports,
  handleImports,
  handleNodeAt,
  handleOutline,
  handleQuery,
} from "./handlers.ts";
import {
  getTreeSitterToolSpec,
  PARAM_SCHEMAS,
  TREE_SITTER_TOOL_SPECS,
  type TreeSitterToolName,
} from "./tool-specs.ts";

function notInitializedResult(): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text: "Tree-sitter not initialized. Start a new session first." }],
    details: {},
  };
}

function textResult(text: string): AgentToolResult<Record<string, unknown>> {
  return { content: [{ type: "text", text }], details: {} };
}

/** Wraps a handler call into a pi-compatible execute function. */
function createExecute(
  fn: (runtime: TreeSitterRuntime, params: Record<string, unknown>) => Promise<string> | string,
  getRuntime: () => TreeSitterRuntime | undefined,
) {
  // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
  return async (
    _toolCallId: string,
    params: Record<string, unknown>,
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: { cwd: string },
  ): Promise<AgentToolResult<Record<string, unknown>>> => {
    const runtime = getRuntime();
    if (!runtime) return notInitializedResult();

    // Guard against direct execute calls (tests, tool reuse) that bypass pi's schema validation
    if (!params.file || typeof params.file !== "string") {
      return textResult("Validation error: `file` is required.");
    }

    try {
      const text = await fn(runtime, params);
      return textResult(text);
    } catch (error) {
      return textResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}

// ── Handler dispatch map ───────────────────────────────────────────────

type HandlerFn = (
  runtime: TreeSitterRuntime,
  params: Record<string, unknown>,
) => Promise<string> | string;

const HANDLER_MAP: Record<TreeSitterToolName, HandlerFn> = {
  tree_sitter_outline: (runtime, params) => handleOutline(runtime, String(params.file)),
  tree_sitter_imports: (runtime, params) => handleImports(runtime, String(params.file)),
  tree_sitter_exports: (runtime, params) => handleExports(runtime, String(params.file)),
  tree_sitter_node_at: (runtime, params) =>
    handleNodeAt(runtime, String(params.file), Number(params.line), Number(params.character)),
  tree_sitter_query: (runtime, params) =>
    handleQuery(runtime, String(params.file), String(params.query)),
  tree_sitter_callees: (runtime, params) =>
    handleCallees(runtime, String(params.file), Number(params.line), Number(params.character)),
};

// ── Registration ───────────────────────────────────────────────────────

/**
 * Register 6 focused tree-sitter tools.
 *
 * @param pi — extension API
 * @param getRuntime — thunk returning the current runtime (or undefined before session_start)
 */
export function registerFocusedTreeSitterTools(
  pi: ExtensionAPI,
  getRuntime: () => TreeSitterRuntime | undefined,
): void {
  for (const spec of TREE_SITTER_TOOL_SPECS) {
    const spec2 = getTreeSitterToolSpec(spec.name);
    pi.registerTool({
      name: spec2.name,
      label: spec2.label,
      description: spec2.description,
      promptSnippet: spec2.promptSnippet,
      promptGuidelines: spec2.promptGuidelines,
      parameters: PARAM_SCHEMAS[spec2.paramSchemaKey],
      execute: createExecute(HANDLER_MAP[spec2.name], getRuntime),
    });
  }
}
