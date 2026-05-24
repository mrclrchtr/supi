import * as fs from "node:fs";
import { renderMap } from "../presentation/markdown/map.ts";
import { normalizePath } from "../search-helpers.ts";
import type { CodeIntelResult } from "../types.ts";
import { buildMapData } from "../use-case/generate-map.ts";

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

  const data = buildMapData(scopePath, ctx.cwd);
  const rendered = renderMap(data);
  return { content: rendered.content, details: { type: "map", data: rendered.details } };
}
