import { buildArchitectureModel } from "../architecture.ts";
import { createStructuralSubstrate } from "../substrates/tree-sitter-adapter.ts";
import type { CodeIntelResult } from "../types.ts";
import { executeBrief } from "../use-case/generate-brief.ts";
import type { BriefInput } from "../use-case/types.ts";
import { validateFocusedToolParams } from "./validation.ts";

export interface CodeBriefToolParams {
  path?: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  maxResults?: number;
}

/** Execute the public code_brief tool through the use-case/presentation layers. */
export async function executeBriefTool(
  params: CodeBriefToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const error = validateFocusedToolParams(params, ctx.cwd);
  if (error) {
    return { content: error, details: undefined };
  }

  const structural = createStructuralSubstrate(ctx.cwd);
  const model = await buildArchitectureModel(ctx.cwd);

  const input: BriefInput = determineInput(params);
  const deps = { model, structural, cwd: ctx.cwd };

  const result = await executeBrief(input, deps);
  return { content: result.content, details: { type: "brief", data: result.details } };
}

function determineInput(params: CodeBriefToolParams): BriefInput {
  if (params.file && params.line != null && params.character != null) {
    return { kind: "anchored", file: params.file, line: params.line, character: params.character };
  }
  if (params.symbol) {
    return { kind: "symbol", symbol: params.symbol, path: params.path };
  }
  if (params.path) {
    return { kind: "path", path: params.path };
  }
  if (params.file) {
    return { kind: "file", file: params.file };
  }
  return { kind: "project" };
}
