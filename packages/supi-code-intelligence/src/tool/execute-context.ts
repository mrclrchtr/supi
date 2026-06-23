import { getCodeProvider } from "../analysis/context/request-context.ts";
import { buildArchitectureModel } from "../model.ts";
import { resolveScope } from "../search-helpers.ts";
import type { CodeIntelResult } from "../types.ts";
import { executeContext } from "../use-case/generate-context.ts";
import { unavailableContextDetails } from "./details-helpers.ts";
import { ensureSemanticReadiness, renderSemanticReadinessTimeout } from "./semantic-readiness.ts";
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
  targetAnchorKind?: "name" | "declaration";
}

/** Track which cwds have already shown git context in this session. */
const shownGitContextCwds = new Set<string>();

/** Execute the public code_context tool through the planner-backed use-case layers. */
export async function executeContextTool(
  params: CodeContextToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const expansion = expandTargetId(params, ctx.cwd);
  if (expansion.kind === "error") {
    return {
      content: expansion.message,
      details: unavailableContextDetails(["Verify the `targetId` is valid and from this session"]),
    };
  }
  if (expansion.kind === "ok") {
    params.file = expansion.file;
    params.line = expansion.line;
    params.character = expansion.character;
    params.targetName = expansion.targetName;
    params.targetKind = expansion.targetKind;
    params.targetAnchorKind = expansion.entry.anchorKind;
  }

  const scopeResolution = resolveScope(params.scope, ctx.cwd);
  if (scopeResolution.kind === "error") {
    return {
      content: `**Error:** ${scopeResolution.reason}`,
      details: unavailableContextDetails([
        "Verify the `scope` path exists and is within the workspace",
      ]),
    };
  }
  const resolvedScope = params.scope ? scopeResolution.path : undefined;

  const readinessResult = await gateSemanticReadiness(params, ctx.cwd);
  if (readinessResult) return readinessResult;

  const providerState = getCodeProvider(ctx.cwd);
  const provider = providerState.kind === "ready" ? providerState.provider : null;
  const lspService =
    providerState.kind === "ready"
      ? providerState.lspService
      : { kind: "unavailable" as const, reason: "No provider" };

  // Always build the model — orientation mode needs it, and task mode falls back
  // to orientation when no target is provided (e.g., scope-only queries).
  const model = await buildArchitectureModel(ctx.cwd);

  // Git context: show once per session (only for orientation calls)
  const hasTarget = !!(params.file && params.line != null && params.character != null);
  const isOrientationCall = !params.task || !hasTarget;
  const showGitContext = isOrientationCall && !shownGitContextCwds.has(ctx.cwd);
  if (isOrientationCall) {
    shownGitContextCwds.add(ctx.cwd);
  }

  const result = await executeContext(
    {
      task: params.task,
      target: buildContextTarget(params),
      scope: resolvedScope,
      budget: params.budget,
      include: params.include,
      maxResults: params.maxResults,
      showGitContext,
    },
    {
      model,
      provider,
      cwd: ctx.cwd,
      lspService,
    },
  );

  return {
    content: result.content,
    details: { type: "context", data: result.details },
  };
}

function buildContextTarget(params: CodeContextToolParams) {
  if (!params.file || params.line == null || params.character == null) return null;
  return {
    file: params.file,
    line: params.line,
    character: params.character,
    name: params.targetName ?? null,
    kind: params.targetKind ?? null,
    anchorKind: params.targetAnchorKind ?? "name",
  };
}

async function gateSemanticReadiness(
  params: CodeContextToolParams,
  cwd: string,
): Promise<CodeIntelResult | null> {
  // Orientation-only and structural-only calls skip the LSP readiness gate.
  const semanticSections = new Set(["references", "implements", "diagnostics", "defs"]);
  const hasSemanticTarget = params.file != null && params.line != null && params.character != null;
  const hasSemanticInclude =
    params.include?.some((section) => semanticSections.has(section)) ?? false;
  if (!hasSemanticTarget && !hasSemanticInclude) return null;

  const readiness = await ensureSemanticReadiness(
    cwd,
    params.file ? { kind: "file", file: params.file } : { kind: "workspace" },
  );
  if (readiness.kind === "timeout") {
    return {
      content: renderSemanticReadinessTimeout("code_context", 15_000),
      details: unavailableContextDetails(["Retry shortly or check `code_health`"]),
    };
  }
  // Let unavailable pass through — downstream section renderers handle
  // unavailable LSP with honest notes rather than blocking the whole call.
  return null;
}
