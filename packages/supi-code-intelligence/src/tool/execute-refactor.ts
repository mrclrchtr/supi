/**
 * code_refactor tool execution.
 *
 * Routes through the planner to get the refactor-capable semantic provider,
 * calls rename/codeActions, validates the returned edit, applies it,
 * and returns the result.
 */

import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { toLspPosition } from "@mrclrchtr/supi-lsp/api";
import { routeFor } from "../planner/planner.ts";
import { renderRefactorResult } from "../presentation/markdown/refactor.ts";
import { applyWorkspaceEdit } from "../refactor/apply-workspace-edit.ts";
import { validateEdit } from "../refactor/safety.ts";
import { normalizePath } from "../search-helpers.ts";
import type { CodeIntelResult } from "../types.ts";

export interface CodeRefactorToolParams {
  operation: "rename";
  file: string;
  line: number;
  character: number;
  newName: string;
  // Future: "code-action" operation could be added here
}

/**
 * Execute the code_refactor tool.
 */
export async function executeRefactorTool(
  params: CodeRefactorToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const route = routeFor(ctx.cwd, "code_refactor");
  if (route.preferred === "unavailable") {
    return {
      content:
        "**Error:** No refactor-capable provider is available for this workspace. Ensure an LSP server is configured and running.",
      details: undefined,
    };
  }

  const runtime = getDefaultWorkspaceRuntime();
  const ws = runtime.getWorkspace(ctx.cwd);
  const provider = ws.semantic.provider;

  if (!provider?.rename) {
    return {
      content: "**Error:** The active semantic provider does not support rename operations.",
      details: undefined,
    };
  }

  const resolvedFile = normalizePath(params.file, ctx.cwd);

  // Execute the rename operation with 0-based LSP coordinates
  const refactorResult = await provider.rename(
    resolvedFile,
    toLspPosition(params.line, params.character),
    params.newName,
  );

  if (refactorResult.kind === "unavailable") {
    return {
      content: `**Refactor unavailable:** ${refactorResult.reason}`,
      details: undefined,
    };
  }

  if (refactorResult.kind === "ambiguous") {
    const candidates = refactorResult.candidates
      .map((c, i) => {
        const location = c.file ? `${c.file}${c.line != null ? `:${c.line}` : ""}` : "";
        return `${i + 1}. ${c.description}${location ? ` (${location})` : ""}`;
      })
      .join("\n");
    return {
      content: `**Refactor ambiguous:** Multiple matching targets found. Please disambiguate:\n${candidates}`,
      details: undefined,
    };
  }

  // Validate the edit
  const validation = validateEdit(refactorResult.edits);
  if (!validation.safe) {
    return {
      content: `**Refactor safety check failed:** ${validation.reason}`,
      details: undefined,
    };
  }

  // Apply the edit
  const applyResult = applyWorkspaceEdit(refactorResult.edits);
  const content = renderRefactorResult({
    result: applyResult,
    operation: `rename "${params.newName}"`,
    targetDescription: `${resolvedFile}:${params.line}:${params.character}`,
  });

  return { content, details: undefined };
}
