import { getCodeProvider } from "../analysis/context/request-context.ts";
import { routeFor } from "../analysis/routing/planner.ts";
import type { CodeIntelResult } from "../types.ts";
import { executeImpact } from "../use-case/generate-impact.ts";
import { ensureSemanticReadiness, renderSemanticReadinessTimeout } from "./semantic-readiness.ts";
import { expandTargetId } from "./target-id-params.ts";
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
  changedFiles?: string[];
  includeTests?: boolean;
}

export type ImpactToolSurface = "impact" | "affected";

/** Execute the shared public impact tool flow for the preferred or compatibility surface. */
export async function executeImpactLikeTool(
  params: CodeImpactToolParams,
  ctx: { cwd: string },
  surface: ImpactToolSurface = "impact",
): Promise<CodeIntelResult> {
  const detailType = surface === "impact" ? "impact" : "affected";
  const preferredTool = surface === "impact" ? "code_impact" : "code_affected";

  const expansion = expandTargetId(params, ctx.cwd);
  if (expansion.kind === "error") {
    return unavailableImpactToolResult(detailType, expansion.message, [
      "Use `code_resolve` to resolve a target first",
    ]);
  }
  if (expansion.kind === "ok") {
    params.file = expansion.file;
    params.line = expansion.line;
    params.character = expansion.character;
  }

  const error = validateFocusedToolParams(params, ctx.cwd);
  if (error) {
    return { content: error, details: undefined };
  }

  const hasDiffInputs = (params.changedFiles?.length || 0) > 0 || Boolean(params.change);
  if (!params.file && !params.symbol && !hasDiffInputs) {
    return unavailableImpactToolResult(
      detailType,
      "**Error:** Impact analysis currently requires either anchored coordinates (`file`, `line`, `character`) or a `symbol` for discovery.",
      ["Use `code_resolve` to resolve a target first"],
    );
  }

  const providerState = getCodeProvider(ctx.cwd);
  const provider = providerState.kind === "ready" ? providerState.provider : null;
  const lspService =
    providerState.kind === "ready"
      ? providerState.lspService
      : { kind: "unavailable" as const, reason: "No provider" };

  if (hasDiffInputs) {
    return executeImpact(params, { cwd: ctx.cwd, provider, lspService }, surface);
  }

  const readinessResult = await waitForImpactSemanticReadiness(
    ctx.cwd,
    params.file,
    detailType,
    preferredTool,
  );
  if (readinessResult) return readinessResult;

  const route = routeFor(ctx.cwd, preferredTool);
  if (route.preferred === "unavailable") {
    return unavailableImpactToolResult(
      detailType,
      "**Error:** No semantic analysis provider is available for this workspace. Check `code_health` for LSP status or enable an LSP server.",
      ["Check LSP configuration for this workspace"],
    );
  }

  return executeImpact(params, { cwd: ctx.cwd, provider, lspService }, surface);
}

/** Execute the preferred public code_impact tool. */
export async function executeImpactTool(
  params: CodeImpactToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  return executeImpactLikeTool(params, ctx, "impact");
}

async function waitForImpactSemanticReadiness(
  cwd: string,
  file: string | undefined,
  detailType: "impact" | "affected",
  preferredTool: "code_impact" | "code_affected",
): Promise<CodeIntelResult | null> {
  const readiness = await ensureSemanticReadiness(
    cwd,
    file ? { kind: "file", file } : { kind: "workspace" },
  );
  if (readiness.kind === "ready") return null;
  if (readiness.kind === "timeout") {
    return unavailableImpactToolResult(
      detailType,
      renderSemanticReadinessTimeout(preferredTool, 15_000),
      ["Check `code_health` for LSP status"],
    );
  }
  return unavailableImpactToolResult(
    detailType,
    "**Error:** No semantic analysis provider is available for this workspace. Check `code_health` for LSP status or enable an LSP server.",
    ["Check `code_health` for LSP status or enable an LSP server."],
  );
}

function unavailableImpactToolResult(
  type: "impact" | "affected",
  content: string,
  nextQueries: string[],
): CodeIntelResult {
  return {
    content,
    details: {
      type,
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
