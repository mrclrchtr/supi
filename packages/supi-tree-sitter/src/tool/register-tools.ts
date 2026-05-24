// Focused tool registration for the tree_sitter extension.
//
// Each tool has its own spec, parameter schema, and prompt guidance.
// Handler functions from ./handlers.ts do the actual work.

import type { AgentToolResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { TreeSitterRuntime } from "../session/runtime.ts";
import {
  handleCallees,
  handleExports,
  handleImports,
  handleNodeAt,
  handleOutline,
  handleQuery,
} from "./handlers.ts";

const FileParam = Type.String({ description: "File path (relative or absolute)" });
const LineParam = Type.Number({ description: "1-based line number", minimum: 1 });
const CharacterParam = Type.Number({ description: "1-based column number (UTF-16)", minimum: 1 });
const QueryParam = Type.String({ description: "Tree-sitter query string" });

const FileOnlyParams = Type.Object({ file: FileParam }, { additionalProperties: false });
const FileLineCharParams = Type.Object(
  { file: FileParam, line: LineParam, character: CharacterParam },
  { additionalProperties: false },
);
const FileQueryParams = Type.Object(
  { file: FileParam, query: QueryParam },
  { additionalProperties: false },
);

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
  const specs = buildToolSpecs(getRuntime);
  for (const spec of specs) {
    pi.registerTool(spec);
  }
}

function buildToolSpecs(getRuntime: () => TreeSitterRuntime | undefined) {
  return [
    {
      name: "tree_sitter_outline",
      label: "Tree-sitter Outline",
      description:
        "Shallow structural outline of declarations in JavaScript/TypeScript files. Returns top-level declarations plus supported class/interface/enum members.",
      promptSnippet: "tree_sitter_outline — shallow outline for Js/Ts files",
      promptGuidelines: [
        "Use tree_sitter_outline(file) for shallow JavaScript or TypeScript structure without reading the whole file.",
      ],
      parameters: FileOnlyParams,
      execute: createExecute(
        (runtime, params) => handleOutline(runtime, String(params.file)),
        getRuntime,
      ),
    },
    {
      name: "tree_sitter_imports",
      label: "Tree-sitter Imports",
      description:
        "List all imports in a JavaScript/TypeScript file. Returns each import's module specifier and source location.",
      promptSnippet: "tree_sitter_imports — list imports for Js/Ts files",
      promptGuidelines: [
        "Use tree_sitter_imports(file) to see module dependencies in JavaScript or TypeScript files.",
      ],
      parameters: FileOnlyParams,
      execute: createExecute(
        (runtime, params) => handleImports(runtime, String(params.file)),
        getRuntime,
      ),
    },
    {
      name: "tree_sitter_exports",
      label: "Tree-sitter Exports",
      description:
        "List all exports in a JavaScript/TypeScript file. Returns each export's kind, name, module specifier (if re-exported), and source location.",
      promptSnippet: "tree_sitter_exports — list exports for Js/Ts files",
      promptGuidelines: [
        "Use tree_sitter_exports(file) for interface or export inspection in JavaScript or TypeScript files.",
      ],
      parameters: FileOnlyParams,
      execute: createExecute(
        (runtime, params) => handleExports(runtime, String(params.file)),
        getRuntime,
      ),
    },
    {
      name: "tree_sitter_node_at",
      label: "Tree-sitter Node At",
      description:
        "Find the exact syntax node and its ancestry at a given position in a file. Works across all supported grammars.",
      promptSnippet: "tree_sitter_node_at — exact syntax node and ancestry at a known position",
      promptGuidelines: [
        "Use tree_sitter_node_at(file, line, character) for the exact syntax node and ancestry at a known position.",
      ],
      parameters: FileLineCharParams,
      execute: createExecute(
        (runtime, params) =>
          handleNodeAt(runtime, String(params.file), Number(params.line), Number(params.character)),
        getRuntime,
      ),
    },
    {
      name: "tree_sitter_query",
      label: "Tree-sitter Query",
      description:
        "Run a custom Tree-sitter query against a file. Supports all grammars tree-sitter can parse.",
      promptSnippet:
        "tree_sitter_query — custom AST pattern matching across all supported grammars",
      promptGuidelines: [
        "Use tree_sitter_query(file, query) for custom Tree-sitter patterns when the built-in actions are not specific enough.",
      ],
      parameters: FileQueryParams,
      execute: createExecute(
        (runtime, params) => handleQuery(runtime, String(params.file), String(params.query)),
        getRuntime,
      ),
    },
    {
      name: "tree_sitter_callees",
      label: "Tree-sitter Callees",
      description:
        "List outgoing function/method callees from the enclosing scope at a given position. Works for many supported grammars.",
      promptSnippet:
        "tree_sitter_callees — outgoing calls from a function or method at a known position",
      promptGuidelines: [
        "Use tree_sitter_callees(file, line, character) for outgoing calls from the enclosing function or method at a known position.",
      ],
      parameters: FileLineCharParams,
      execute: createExecute(
        (runtime, params) =>
          handleCallees(
            runtime,
            String(params.file),
            Number(params.line),
            Number(params.character),
          ),
        getRuntime,
      ),
    },
  ];
}
