import { getCodeProvider } from "../analysis/context/request-context.ts";
import { buildArchitectureModel } from "../model.ts";
import type { CodeIntelResult } from "../types.ts";
import { executeContext } from "../use-case/generate-context.ts";
import { expandTargetId } from "./target-id-params.ts";

export interface CodeContextToolParams {
  task?: string;
  targetId?: string;
  scope?: string;
  budget?: "small" | "medium" | "large";
  include?: Array<
    "defs" | "references" | "callees" | "tests" | "docs" | "diagnostics" | "exports" | "imports"
  >;
  maxResults?: number;
  // Internal-only expansion fields populated from targetId.
  file?: string;
  line?: number;
  character?: number;
  targetName?: string | null;
  targetKind?: string | null;
}

/** Execute the public code_context tool through the planner-backed use-case layers. */
export async function executeContextTool(
  params: CodeContextToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const expansion = expandTargetId(params, ctx.cwd);
  if (expansion.kind === "error") {
    return { content: expansion.message, details: undefined };
  }
  if (expansion.kind === "ok") {
    params.file = expansion.file;
    params.line = expansion.line;
    params.character = expansion.character;
    params.targetName = expansion.targetName;
    params.targetKind = expansion.targetKind;
  }

  const providerState = getCodeProvider(ctx.cwd);
  const provider = providerState.kind === "ready" ? providerState.provider : null;

  // Always build the model — orientation mode needs it, and task mode falls back
  // to orientation when no target is provided (e.g., scope-only queries).
  const model = await buildArchitectureModel(ctx.cwd);
  const result = await executeContext(
    {
      task: params.task,
      target:
        params.file && params.line != null && params.character != null
          ? {
              file: params.file,
              line: params.line,
              character: params.character,
              name: params.targetName ?? null,
              kind: params.targetKind ?? null,
            }
          : null,
      scope: params.scope,
      budget: params.budget,
      include: params.include,
      maxResults: params.maxResults,
    },
    {
      model,
      provider,
      cwd: ctx.cwd,
    },
  );

  return {
    content: result.content,
    details: { type: "context", data: result.details },
  };
}
