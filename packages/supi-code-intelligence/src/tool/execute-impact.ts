import { routeFor } from "../analysis/routing/planner.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../types.ts";
import { executeImpact } from "../use-case/generate-impact.ts";
import { unavailableImpactDetails } from "./details-helpers.ts";
import { emitToolProgress } from "./progress.ts";
import { ensureSemanticReadiness, renderSemanticReadinessTimeout } from "./semantic-readiness.ts";
import { validateFocusedToolParams } from "./validation.ts";

export interface CodeImpactToolParams {
  targetId?: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  exportedOnly?: boolean;
  maxResults?: number;
  change?: string;
  changeSetFiles?: string[];
  includeTests?: boolean;
}

/** Execute the public code_impact tool. */
export async function executeImpactTool(
  params: CodeImpactToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  emitToolProgress(ctx.onUpdate, "code_impact: analyzing blast radius...");

  const expansion = ctx.session.expandTargetId(params);
  if (expansion.kind === "error") {
    return {
      content: expansion.message,
      details: unavailableImpactDetails(["Use `code_resolve` to resolve a target first"]),
    };
  }
  if (expansion.kind === "ok") {
    params.file = expansion.file;
    params.line = expansion.line;
    params.character = expansion.character;
  }

  const error = validateFocusedToolParams(params, ctx.cwd);
  if (error) {
    return {
      content: error,
      details: unavailableImpactDetails(["Fix the input parameters and retry"]),
    };
  }

  const hasChangeSetInputs = (params.changeSetFiles?.length || 0) > 0 || Boolean(params.change);
  if (!params.file && !params.symbol && !hasChangeSetInputs) {
    return unavailableImpactToolResult(
      "**Error:** Impact analysis currently requires either anchored coordinates (`file`, `line`, `character`) or a `symbol` for discovery.",
      ["Use `code_resolve` to resolve a target first"],
    );
  }

  const providerState = ctx.session.getProviders();
  const provider = providerState.kind === "ready" ? providerState.provider : null;
  const lspService =
    providerState.kind === "ready"
      ? providerState.lspService
      : { kind: "unavailable" as const, reason: "No provider" };

  if (hasChangeSetInputs) {
    emitToolProgress(ctx.onUpdate, "code_impact: analyzing impact input...");
    return executeImpact(params, { cwd: ctx.cwd, provider, lspService });
  }

  const readinessResult = await waitForImpactSemanticReadiness(ctx.cwd, params.file);
  if (readinessResult) return readinessResult;

  const route = routeFor(ctx.cwd, "code_impact");
  if (route.preferred === "unavailable") {
    return unavailableImpactToolResult(
      "**Error:** No semantic analysis provider is available for this workspace. Check `code_health` for LSP status or enable an LSP server.",
      ["Check LSP configuration for this workspace"],
    );
  }

  emitToolProgress(ctx.onUpdate, "code_impact: sweeping references...");
  return executeImpact(params, { cwd: ctx.cwd, provider, lspService });
}

async function waitForImpactSemanticReadiness(
  cwd: string,
  file: string | undefined,
): Promise<CodeIntelResult | null> {
  const readiness = await ensureSemanticReadiness(
    cwd,
    file ? { kind: "file", file } : { kind: "workspace" },
  );
  if (readiness.kind === "ready") return null;
  if (readiness.kind === "timeout") {
    return unavailableImpactToolResult(renderSemanticReadinessTimeout("code_impact", 15_000), [
      "Check `code_health` for LSP status",
    ]);
  }
  return unavailableImpactToolResult(
    "**Error:** No semantic analysis provider is available for this workspace. Check `code_health` for LSP status or enable an LSP server.",
    ["Check `code_health` for LSP status or enable an LSP server."],
  );
}

function unavailableImpactToolResult(content: string, nextQueries: string[]): CodeIntelResult {
  return {
    content,
    details: {
      type: "impact",
      data: {
        confidence: "unavailable" as const,
        directCount: 0,
        downstreamCount: 0,
        riskLevel: "low" as const,
        checkNext: [],
        likelyTests: [],
        likelyTestCommands: [],
        omittedCount: 0,
        nextQueries,
      },
    },
  };
}
