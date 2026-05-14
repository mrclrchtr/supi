/**
 * Shared test utilities for asserting on registered pi tools.
 *
 * Tools registered via `pi.registerTool()` are stored as `unknown[]`
 * in the pi mock. These helpers provide typed access and throw
 * on not-found to avoid non-null assertions that Biome prohibits.
 */

import type { PiMock } from "./pi-mock.ts";

export interface ToolDef {
  name: string;
  label?: string;
  description?: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters?: unknown;
  execute: (...args: unknown[]) => Promise<unknown>;
}

/**
 * Returns all registered tools, typed as ToolDef[].
 */
export function getTools(pi: PiMock): ToolDef[] {
  return pi.tools as unknown as ToolDef[];
}

/**
 * Finds a registered tool by name, or throws if not found.
 *
 * @example
 * ```ts
 * const tool = getTool(pi, "web_docs_search");
 * const result = await tool.execute("tc-1", { library_name: "react" }, undefined, undefined, ctx);
 * ```
 */
export function getTool(pi: PiMock, name: string): ToolDef {
  const tool = getTools(pi).find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found — did the extension register it?`);
  return tool;
}
