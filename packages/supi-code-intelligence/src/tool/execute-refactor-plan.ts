/**
 * Tool executor for the preview-only refactor planning path.
 * Does not mutate files and returns a plan ID for later use with code_refactor_apply.
 */

import {
  normalizeRefactorOperation,
  type RefactorOperation,
  type RefactorResult,
  type SemanticProvider,
  type SourceRange,
} from "@mrclrchtr/supi-code-runtime/api";
import { toLspPosition } from "@mrclrchtr/supi-lsp/api";
import {
  computeFileFingerprint,
  generatePlanId,
  type RefactorPlan,
} from "../analysis/refactor/plan-store.ts";
import { validateEdit } from "../analysis/refactor/safety.ts";
import { normalizePath } from "../analysis/search/helpers.ts";
import { createEvidenceList } from "../presentation/evidence-list.ts";
import { renderRefactorPlanResult } from "../presentation/markdown/refactor.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../types.ts";
import { unavailableSearchDetails } from "./details-helpers.ts";
import { gateSemanticReadiness, runPipe } from "./pipeline.ts";
import { renderSemanticReadinessTimeout } from "./semantic-readiness.ts";

export interface CodeRefactorPlanToolParams {
  targetId?: string;
  operation: string;
  file?: string;
  line?: number;
  character?: number;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newName?: string;
}

type CanonicalRefactorOperation = Exclude<RefactorOperation, "rename">;

export async function executeRefactorPlanTool(
  params: CodeRefactorPlanToolParams,
  ctx: Pick<CodeIntelToolExecCtx, "cwd" | "session">,
  invokedAs: "code_refactor_plan" = "code_refactor_plan",
): Promise<CodeIntelResult> {
  const normalizedOperation = normalizeRequestedOperation(params.operation);
  if (normalizedOperation.kind === "error") {
    return {
      content: normalizedOperation.message,
      details: unavailableSearchDetails(null, [
        'Use one of: "rename", "rename_symbol", "extract_function", "extract_variable"',
      ]),
    };
  }
  const operation = normalizedOperation.operation;

  const target = resolveRefactorTarget(params, ctx.cwd, operation, ctx.session);
  if ("content" in target) return target;

  return runPipe(
    params,
    ctx as CodeIntelToolExecCtx,
    [
      gateSemanticReadiness("code_refactor_plan", {
        fileParam: "file",
        onTimeout: () => ({
          content: renderSemanticReadinessTimeout(invokedAs, 15_000),
          details: unavailableSearchDetails(null, ["Retry shortly or check `code_health`"]),
        }),
        throwOnUnavailable: true,
      }),
    ],
    async (_p, c) => {
      const provider = c.session.getSemanticProvider();
      const resolvedFile = normalizePath(target.file, c.cwd);
      const position = toLspPosition(target.line, target.character);

      const refactorResult = await planRefactorWithProvider(provider, {
        operation,
        file: resolvedFile,
        position,
        range: params.range ? toLspRange(params.range) : undefined,
        newName: params.newName,
      });

      if (refactorResult.kind === "unavailable") {
        throw new Error(`Refactor unavailable: ${refactorResult.reason}`);
      }

      if (refactorResult.kind === "ambiguous") {
        return renderAmbiguousRefactorResult(refactorResult);
      }

      const validation = validateEdit(refactorResult.edits);
      if (!validation.safe) {
        return {
          content: `**Refactor safety check failed:** ${validation.reason}`,
          details: unavailableSearchDetails(null, ["Adjust the target or range and retry"]),
        };
      }

      const fileFingerprints = collectFileFingerprints(refactorResult.edits.edits);
      const planId = generatePlanId(
        operation,
        resolvedFile,
        target.line,
        target.character,
        params.newName ?? "",
      );

      const plan: RefactorPlan = {
        id: planId,
        operation,
        newName: params.newName,
        targetFile: resolvedFile,
        targetLine: target.line,
        targetCharacter: target.character,
        edits: refactorResult.edits,
        fileFingerprints,
        createdAt: Date.now(),
      };
      c.session.storePlan(plan);

      const editEvidence = createEvidenceList({
        key: "refactor.edits",
        items: refactorResult.edits.edits,
        maxResults: 5,
      }).metadata;
      const content = renderRefactorPlanResult(plan, c.cwd);

      return {
        content,
        details: {
          type: "search" as const,
          data: {
            confidence: "semantic" as const,
            scope: null,
            candidateCount: refactorResult.edits.edits.length,
            omittedCount: editEvidence.omittedCount ?? 0,
            evidenceLists: [editEvidence],
            nextQueries: [
              `Use code_refactor_apply with planId: "${planId}" to apply this refactor`,
            ],
          },
        },
      };
    },
  );
}

function normalizeRequestedOperation(
  operation: string,
): { kind: "ok"; operation: CanonicalRefactorOperation } | { kind: "error"; message: string } {
  if (
    operation === "rename" ||
    operation === "rename_symbol" ||
    operation === "extract_function" ||
    operation === "extract_variable"
  ) {
    return {
      kind: "ok",
      operation: normalizeRefactorOperation(operation as RefactorOperation),
    };
  }

  return {
    kind: "error",
    message:
      `**Error:** Unsupported refactor operation: "${operation}". The public \`code_refactor_plan\` tool currently supports: ` +
      '"rename", "rename_symbol", "extract_function", "extract_variable".',
  };
}

/**
 * Expand targetId and apply cross-field rules for code_refactor_plan.
 *
 * TypeBox (via pi schema validation) already enforces:
 * - operation must be a valid StringEnum value
 * - range shape (start/end with line/character numbers)
 * - additionalProperties: false
 *
 * This covers cross-field constraints: target required, newName for
 * rename/extract, range for extract, and range ordering.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: target expansion and operation-specific validation are kept together for clear user-facing errors.
function resolveRefactorTarget(
  params: CodeRefactorPlanToolParams,
  _cwd: string,
  operation: CanonicalRefactorOperation,
  session: CodeIntelToolExecCtx["session"],
): CodeIntelResult | { file: string; line: number; character: number } {
  const expansion = session.expandTargetId(params);
  if (expansion.kind === "error") {
    return {
      content: expansion.message,
      details: unavailableSearchDetails(null, [
        "Verify the `targetId` is valid and from this session",
      ]),
    };
  }
  if (expansion.kind === "ok") {
    params.file = expansion.file;
    params.line = expansion.line;
    params.character = expansion.character;

    // Per ADR 0003: rename_symbol is position-strict — LSP rename requires
    // the identifier (name anchor), and a declaration anchor (the `export`
    // keyword) silently yields empty or wrong edits. Refuse before planning.
    if (operation === "rename_symbol" && expansion.entry.anchorKind === "declaration") {
      return {
        content:
          `**Cannot plan rename:** The resolved target fell back to a declaration anchor (the \`export\` keyword or similar), not an identifier (name anchor). LSP \`rename\` requires the identifier. ` +
          `Re-resolve via \`code_resolve\` after the language server has indexed the file, ` +
          `or pass \`file\` + \`line\` + \`character\` anchored directly on the identifier.`,
        details: unavailableSearchDetails(null, [
          "Re-resolve via `code_resolve` when the LSP has indexed the file",
          "Or use `file` + `line` + `character` anchored on the identifier directly",
        ]),
      };
    }
  }

  if (!params.file) {
    return {
      content:
        "**Error:** Refactor preview requires a `file`. Provide `targetId` (from `code_resolve`) or `file` + `line` + `character`.",
      details: unavailableSearchDetails(null, [
        "Provide `targetId` from `code_resolve` or `file` + `line` + `character`",
      ]),
    };
  }

  if (isExtractOperation(operation) && params.range) {
    const rangeError = validatePublicRange(params.range);
    if (rangeError) {
      return {
        content: rangeError,
        details: unavailableSearchDetails(null, ["Ensure `range.end` is after `range.start`"]),
      };
    }
    if (params.line == null || params.character == null) {
      params.line = params.range.start.line;
      params.character = params.range.start.character;
    }
  }

  if (params.line == null || params.character == null) {
    return {
      content:
        "**Error:** Refactor preview requires `line` and `character`. Provide `targetId` (from `code_resolve`) or `file` + `line` + `character`.",
      details: unavailableSearchDetails(null, [
        "Provide `targetId` from `code_resolve` or `file` + `line` + `character`",
      ]),
    };
  }

  if ((operation === "rename_symbol" || isExtractOperation(operation)) && !params.newName) {
    return {
      content: `**Error:** Refactor preview requires \`newName\` for \`${operation}\`.`,
      details: unavailableSearchDetails(null, [`Provide \`newName\` for \`${operation}\``]),
    };
  }

  if (isExtractOperation(operation) && !params.range) {
    return {
      content: `**Error:** Refactor preview requires \`range\` for \`${operation}\`.`,
      details: unavailableSearchDetails(null, [`Provide a 1-based \`range\` for \`${operation}\``]),
    };
  }

  return {
    file: params.file,
    line: params.line,
    character: params.character,
  };
}

function renderAmbiguousRefactorResult(
  refactorResult: Extract<RefactorResult, { kind: "ambiguous" }>,
): CodeIntelResult {
  const candidates = refactorResult.candidates
    .map(
      (candidate, index) =>
        `${index + 1}. ${candidate.description} (${candidate.file}:${candidate.line})`,
    )
    .join("\n");
  return {
    content: `**Refactor ambiguous:** Multiple matching targets found. Please disambiguate:\n${candidates}`,
    details: unavailableSearchDetails(null, [
      "Use `targetId` from `code_resolve` or provide precise anchored coordinates",
    ]),
  };
}

async function planRefactorWithProvider(
  provider: SemanticProvider | null,
  request: {
    operation: CanonicalRefactorOperation;
    file: string;
    position: { line: number; character: number };
    range?: SourceRange;
    newName?: string;
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

function isExtractOperation(operation: CanonicalRefactorOperation): boolean {
  return operation === "extract_function" || operation === "extract_variable";
}

function validatePublicRange(
  range: NonNullable<CodeRefactorPlanToolParams["range"]>,
): string | null {
  if (
    range.end.line < range.start.line ||
    (range.end.line === range.start.line && range.end.character <= range.start.character)
  ) {
    return "**Error:** Refactor preview requires `range.end` to be after `range.start`.";
  }
  return null;
}

function toLspRange(range: NonNullable<CodeRefactorPlanToolParams["range"]>): SourceRange {
  return {
    start: toLspPosition(range.start.line, range.start.character),
    end: toLspPosition(range.end.line, range.end.character),
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
