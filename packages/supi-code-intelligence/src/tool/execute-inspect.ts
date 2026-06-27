import type { CodeIntelResult, CodeIntelToolExecCtx } from "../types.ts";
import { executeInspect } from "../use-case/generate-inspect.ts";
import { unavailableInspectDetails } from "./details-helpers.ts";
import { ensureSemanticReadiness, renderSemanticReadinessTimeout } from "./semantic-readiness.ts";
import { validateFocusedToolParams } from "./validation.ts";

export interface CodeInspectToolParams {
  file: string;
  line: number;
  character: number;
  maxResults?: number;
}

export async function executeInspectTool(
  params: Partial<CodeInspectToolParams>,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const validationError = validateFocusedToolParams(params, ctx.cwd);
  if (validationError) {
    return {
      content: validationError,
      details: unavailableInspectDetails("validation error", [
        "Provide `file`, `line`, and `character` for point inspection",
      ]),
    };
  }

  if (!params.file || params.line == null || params.character == null) {
    return {
      content: "**Error:** `code_inspect` requires `file`, `line`, and `character`.",
      details: unavailableInspectDetails("missing coordinates", [
        "Provide `file`, `line`, and `character` for point inspection",
      ]),
    };
  }

  const readiness = await ensureSemanticReadiness(ctx.cwd, {
    kind: "file",
    file: params.file,
  });
  if (readiness.kind === "timeout") {
    return {
      content: renderSemanticReadinessTimeout("code_inspect", 15_000),
      details: unavailableInspectDetails(params.file, ["Retry shortly or check `code_health`"]),
    };
  }
  // Let unavailable pass through — the use-case layer handles missing
  // providers with explicit unavailable-section notes.

  const providerState = ctx.session.getProviders();
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
