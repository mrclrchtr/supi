/**
 * Tool executor for the preview-only refactor planning path shared by
 * code_refactor (preferred) and code_refactor_plan (compatibility alias).
 * Does not mutate files and returns a plan ID for later use with code_apply.
 */

import {
  getDefaultWorkspaceRuntime,
  normalizeRefactorOperation,
  type RefactorOperation,
  type RefactorResult,
  type SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { toLspPosition } from "@mrclrchtr/supi-lsp/api";
import {
  computeFileFingerprint,
  generatePlanId,
  type RefactorPlan,
  storePlan,
} from "../analysis/refactor/plan-store.ts";
import { validateEdit } from "../analysis/refactor/safety.ts";
import { routeFor } from "../analysis/routing/planner.ts";
import { renderRefactorPlanResult } from "../presentation/markdown/refactor.ts";
import { normalizePath } from "../search-helpers.ts";
import type { CodeIntelResult } from "../types.ts";
import { expandTargetId } from "./target-id-params.ts";

export interface CodeRefactorPlanToolParams {
  targetId?: string;
  operation: string;
  file?: string;
  line?: number;
  character?: number;
  newName?: string;
  destination?: string;
}

type CanonicalRefactorOperation = Exclude<RefactorOperation, "rename">;

export async function executeRefactorPlanTool(
  params: CodeRefactorPlanToolParams,
  ctx: { cwd: string },
  invokedAs: "code_refactor" | "code_refactor_plan" = "code_refactor_plan",
): Promise<CodeIntelResult> {
  const normalizedOperation = normalizeRequestedOperation(params.operation);
  if (normalizedOperation.kind === "error") {
    return {
      content: normalizedOperation.message,
      details: undefined,
    };
  }
  const operation = normalizedOperation.operation;

  // Expand targetId if provided (takes precedence over raw coords)
  const expansion = expandTargetId(params, ctx.cwd);
  if (expansion.kind === "error") {
    return { content: expansion.message, details: undefined };
  }
  if (expansion.kind === "ok") {
    params.file = expansion.file;
    params.line = expansion.line;
    params.character = expansion.character;
  }

  // Validate file + coordinates after targetId expansion
  if (!params.file) {
    return {
      content:
        "**Error:** Refactor preview requires a `file`. Provide `targetId` (from `code_resolve`) or `file` + `line` + `character`.",
      details: undefined,
    };
  }
  if (params.line == null || params.character == null) {
    return {
      content:
        "**Error:** Refactor preview requires `line` and `character`. Provide `targetId` (from `code_resolve`) or `file` + `line` + `character`.",
      details: undefined,
    };
  }

  if (operation === "rename_file" || operation === "move_file") {
    // TODO(TNDM-D9FEHR): Replace this explicit unavailable result once shared
    // file/resource edits and rollback semantics exist end-to-end.
    return {
      content: `**Refactor unavailable:** Refactor operation "${operation}" is not supported yet. File/resource operations are deferred.`,
      details: undefined,
    };
  }

  if (operation === "rename_symbol" && !params.newName) {
    return {
      content: "**Error:** Refactor preview requires `newName` for `rename_symbol`.",
      details: undefined,
    };
  }

  const route = routeFor(ctx.cwd, invokedAs);
  if (route.preferred === "unavailable") {
    return {
      content:
        "**Error:** No refactor-capable semantic provider is available. Ensure an LSP server is configured and running.",
      details: undefined,
    };
  }

  const runtime = getDefaultWorkspaceRuntime();
  const ws = runtime.getWorkspace(ctx.cwd);
  const provider = ws.semantic.provider;
  const resolvedFile = normalizePath(params.file, ctx.cwd);
  const position = toLspPosition(params.line, params.character);

  const refactorResult = await planRefactorWithProvider(provider, {
    operation,
    file: resolvedFile,
    position,
    newName: params.newName,
    destination: params.destination,
  });

  if (refactorResult.kind === "unavailable") {
    return {
      content: `**Refactor unavailable:** ${refactorResult.reason}`,
      details: undefined,
    };
  }

  if (refactorResult.kind === "ambiguous") {
    const candidates = refactorResult.candidates
      .map(
        (candidate, index) =>
          `${index + 1}. ${candidate.description} (${candidate.file}:${candidate.line})`,
      )
      .join("\n");
    return {
      content: `**Refactor ambiguous:** Multiple matching targets found. Please disambiguate:\n${candidates}`,
      details: undefined,
    };
  }

  const validation = validateEdit(refactorResult.edits);
  if (!validation.safe) {
    return {
      content: `**Refactor safety check failed:** ${validation.reason}`,
      details: undefined,
    };
  }

  const fileFingerprints = collectFileFingerprints(refactorResult.edits.edits);
  const planId = generatePlanId(
    operation,
    resolvedFile,
    params.line,
    params.character,
    params.newName ?? params.destination ?? "",
  );

  const plan: RefactorPlan = {
    id: planId,
    operation,
    newName: params.newName,
    destination: params.destination,
    targetFile: resolvedFile,
    targetLine: params.line,
    targetCharacter: params.character,
    edits: refactorResult.edits,
    fileFingerprints,
    createdAt: Date.now(),
  };
  storePlan(plan);

  const content = renderRefactorPlanResult(plan, ctx.cwd);

  return {
    content,
    details: {
      type: "search" as const,
      data: {
        confidence: "semantic" as const,
        scope: null,
        candidateCount: refactorResult.edits.edits.length,
        omittedCount: 0,
        nextQueries: [`Use code_apply with planId: "${planId}" to apply this refactor`],
      },
    },
  };
}

function normalizeRequestedOperation(
  operation: string,
): { kind: "ok"; operation: CanonicalRefactorOperation } | { kind: "error"; message: string } {
  if (
    operation === "rename" ||
    operation === "rename_symbol" ||
    operation === "rename_file" ||
    operation === "move_file" ||
    operation === "update_imports" ||
    operation === "delete_dead_code"
  ) {
    return {
      kind: "ok",
      operation: normalizeRefactorOperation(operation as RefactorOperation),
    };
  }

  return {
    kind: "error",
    message: `**Error:** Unsupported refactor operation: "${operation}". Supported operations: "rename", "rename_symbol", "rename_file", "move_file", "update_imports", "delete_dead_code".`,
  };
}

async function planRefactorWithProvider(
  provider: SemanticProvider | null,
  request: {
    operation: CanonicalRefactorOperation;
    file: string;
    position: { line: number; character: number };
    newName?: string;
    destination?: string;
  },
): Promise<RefactorResult> {
  if (!provider) {
    return {
      kind: "unavailable",
      reason: "No semantic provider is available.",
    };
  }

  if (provider.refactor) {
    return provider.refactor(request);
  }

  if (request.operation === "rename_symbol" && provider.rename && request.newName) {
    return provider.rename(request.file, request.position, request.newName);
  }

  return {
    kind: "unavailable",
    reason: `The active semantic provider does not support refactor planning for operation "${request.operation}".`,
  };
}

function collectFileFingerprints(
  edits: Array<{ file: string }>,
): Array<{ file: string; fingerprint: string }> {
  const seen = new Set<string>();
  const fingerprints: Array<{ file: string; fingerprint: string }> = [];

  for (const edit of edits) {
    if (seen.has(edit.file)) continue;
    seen.add(edit.file);
    fingerprints.push({
      file: edit.file,
      fingerprint: computeFileFingerprint(edit.file),
    });
  }

  return fingerprints;
}
