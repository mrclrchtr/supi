/**
 * Shared registration helper for tool families.
 *
 * Registers a set of tool definitions (from specs) into pi
 * with optional prompt guidance overrides.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Tool spec shape that registerToolFamily accepts. */
export interface ToolFamilySpec {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    ...args: unknown[]
  ) => Promise<{ content: Array<{ type: "text"; text: string }>; details?: unknown }>;
}

/** Prompt surface overrides indexed by tool name. */
export interface PromptSurfaceMap {
  [toolName: string]: {
    description?: string;
    promptSnippet?: string;
    promptGuidelines?: string | string[];
  };
}

/**
 * Register a tool family from an array of specs.
 *
 * @param pi The extension API instance.
 * @param specs Tool definitions to register.
 * @param promptSurfaces Optional prompt surface overrides per tool name.
 */
export function registerToolFamily(
  pi: ExtensionAPI,
  specs: ToolFamilySpec[],
  promptSurfaces?: PromptSurfaceMap,
): void {
  for (const spec of specs) {
    const surface = promptSurfaces?.[spec.name];
    const raw = surface?.promptGuidelines;
    const promptGuidelines: string[] | undefined = Array.isArray(raw)
      ? raw
      : raw
        ? [raw]
        : undefined;
    pi.registerTool({
      name: spec.name,
      label: spec.label,
      description: surface?.description ?? spec.description,
      promptSnippet: surface?.promptSnippet,
      promptGuidelines,
      parameters: spec.parameters as Record<string, unknown>,
      execute: spec.execute as (
        ...args: unknown[]
      ) => ReturnType<NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>>,
    });
  }
}
