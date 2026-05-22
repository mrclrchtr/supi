import * as fs from "node:fs";
import { executeMapAction } from "../actions/map-action.ts";
import { normalizePath } from "../search-helpers.ts";
import type { CodeIntelResult } from "../types.ts";

export interface CodeMapToolParams {
  path?: string;
}

/** Execute the public code_map tool with focused directory validation. */
export async function executeMapTool(
  params: CodeMapToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const scopePath = params.path ? normalizePath(params.path, ctx.cwd) : ctx.cwd;

  if (!fs.existsSync(scopePath)) {
    return {
      content: `**Error:** code_map path not found: \`${params.path ?? scopePath}\``,
      details: undefined,
    };
  }

  if (!fs.statSync(scopePath).isDirectory()) {
    return {
      content: "**Error:** code_map requires a directory path, not a file.",
      details: undefined,
    };
  }

  return executeMapAction(scopePath, ctx.cwd);
}
