import { getCodeProvider } from "../analysis/context/request-context.ts";
import type { CodeIntelResult } from "../types.ts";
import { executeInspect } from "../use-case/generate-inspect.ts";
import { validateFocusedToolParams } from "./validation.ts";

export interface CodeInspectToolParams {
  file: string;
  line: number;
  character: number;
  maxResults?: number;
}

export async function executeInspectTool(
  params: Partial<CodeInspectToolParams>,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const validationError = validateFocusedToolParams(params, ctx.cwd);
  if (validationError) {
    return { content: validationError, details: undefined };
  }

  if (!params.file || params.line == null || params.character == null) {
    return {
      content: "**Error:** `code_inspect` requires `file`, `line`, and `character`.",
      details: undefined,
    };
  }

  const providerState = getCodeProvider(ctx.cwd);
  const provider = providerState.kind === "ready" ? providerState.provider : null;
  const lspService =
    providerState.kind === "ready"
      ? providerState.lspService
      : { kind: "unavailable" as const, reason: "No provider" };
  const result = await executeInspect(
    {
      file: params.file,
      line: params.line,
      character: params.character,
      maxResults: params.maxResults,
    },
    { provider, cwd: ctx.cwd, lspService },
  );

  return { content: result.content, details: { type: "inspect", data: result.details } };
}
