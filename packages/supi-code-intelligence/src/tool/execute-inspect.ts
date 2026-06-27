/**
 * Tool executor for code_inspect — factual point inspection.
 */

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../types.ts";
import { executeInspect } from "../use-case/generate-inspect.ts";
import { unavailableInspectDetails } from "./details-helpers.ts";
import { focusedToolRules } from "./cross-field.ts";
import { gateSemanticReadiness, runPipe, validateParams } from "./pipeline.ts";
import { renderSemanticReadinessTimeout } from "./semantic-readiness.ts";

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
  return runPipe(
    params,
    ctx,
    [
      validateParams(focusedToolRules(), (msg) => ({
        content: msg,
        details: unavailableInspectDetails("validation error", [
          "Provide `file`, `line`, and `character` for point inspection",
        ]),
      })),
      gateSemanticReadiness("code_inspect", {
        fileParam: "file",
        onTimeout: () => ({
          content: renderSemanticReadinessTimeout("code_inspect", 15_000),
          details: unavailableInspectDetails("timeout", ["Retry shortly or check `code_health`"]),
        }),
        // Unavailable LSP passes through — the use-case layer renders
        // explicit unavailable-section notes.
        passThroughOnUnavailable: true,
      }),
    ],
    async (p, c) => {
      if (!p.file || p.line == null || p.character == null) {
        return {
          content: "**Error:** `code_inspect` requires `file`, `line`, and `character`.",
          details: unavailableInspectDetails("missing coordinates", [
            "Provide `file`, `line`, and `character` for point inspection",
          ]),
        };
      }

      const providerState = c.session.getProviders();
      const provider = providerState.kind === "ready" ? providerState.provider : null;
      const lspService =
        providerState.kind === "ready"
          ? providerState.lspService
          : { kind: "unavailable" as const, reason: "No provider" };

      // Let unavailable pass through — the use-case layer handles missing
      // providers with explicit unavailable-section notes.
      const result = await executeInspect(
        {
          file: p.file,
          line: p.line,
          character: p.character,
          maxResults: p.maxResults,
        },
        { provider, cwd: c.cwd, lspService },
      );

      return { content: result.content, details: { type: "inspect", data: result.details } };
    },
  );
}
