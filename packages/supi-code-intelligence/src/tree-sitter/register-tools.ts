// Tree-sitter tool registration — registers tree_sitter_* tools using the umbrella's specs.
//
// Tool execution delegates to supi-tree-sitter's handler functions.
// biome-ignore-all lint/complexity/useMaxParams: pi ToolDefinition.execute signature requires 5 params.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TreeSitterRuntime } from "@mrclrchtr/supi-tree-sitter/api";
import { defaultTsToolPromptSurfaces, type TsToolPromptSurfaceMap } from "./guidance.ts";
import { executeTsTool } from "./tool-actions.ts";
import { PARAM_SCHEMAS, TREE_SITTER_TOOL_SPECS } from "./tool-specs.ts";

/**
 * Register 6 focused tree-sitter tools.
 *
 * @param pi — extension API
 * @param getRuntime — thunk returning the current runtime (or undefined before session_start)
 * @param promptSurfaces — optional override for prompt surfaces
 */
export function registerTsTools(
  pi: ExtensionAPI,
  getRuntime: () => TreeSitterRuntime | undefined,
  promptSurfaces: TsToolPromptSurfaceMap = defaultTsToolPromptSurfaces,
): void {
  for (const spec of TREE_SITTER_TOOL_SPECS) {
    const surface = promptSurfaces[spec.name];
    pi.registerTool({
      name: spec.name,
      label: spec.label,
      description: surface.description,
      promptSnippet: surface.promptSnippet,
      promptGuidelines: surface.promptGuidelines,
      parameters: PARAM_SCHEMAS[spec.paramSchemaKey],
      execute: createTsExecutor(getRuntime, spec.name),
    });
  }
}

function createTsExecutor(getRuntime: () => TreeSitterRuntime | undefined, toolName: string) {
  return async (
    _toolCallId: string,
    params: Record<string, unknown>,
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: ExtensionContext,
  ) => {
    const runtime = getRuntime();
    if (!runtime) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Tree-sitter not initialized. Start a new session first.",
          },
        ],
        details: {},
      };
    }

    if (!params.file || typeof params.file !== "string") {
      return {
        content: [{ type: "text" as const, text: "Validation error: `file` is required." }],
        details: {},
      };
    }

    try {
      const text = await executeTsTool(toolName, runtime, params);
      return { content: [{ type: "text" as const, text }], details: {} };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        details: {},
      };
    }
  };
}
