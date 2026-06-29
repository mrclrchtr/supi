/**
 * Refactor plan orchestration use-case.
 *
 * Handles operation normalization, target resolution, provider-based
 * refactor planning, plan storage, and safety validation. Returns a
 * rendered CodeIntelResult with a stored planId for later application.
 *
 * Extracted from execute-refactor-plan.ts as part of the thin-executor
 * normalization.
 */

import {
  normalizeRefactorOperation,
  type RefactorOperation,
  type RefactorResult,
  type SemanticProvider,
  type SourceRange,
} from "@mrclrchtr/supi-code-runtime/api";
import { toLspPosition } from "@mrclrchtr/supi-lsp/api";
import { createEvidenceList } from "../../analysis/evidence.ts";
import { validateEdit } from "../../analysis/refactor/safety.ts";
import { normalizePath } from "../../analysis/search/ripgrep.ts";
import {
  computeFileFingerprint,
  generatePlanId,
  type RefactorPlan,
} from "../../session/refactor-plans.ts";
import type { WorkspaceCodeIntelligenceSession } from "../../session/session.ts";
import type { CodeIntelResult } from "../../types/index.ts";
import { unavailableSearchDetails } from "../infra/error-results.ts";
import { renderRefactorPlanResult } from "./markdown.ts";

type CanonicalRefactorOperation = Exclude<RefactorOperation, "rename">;

export interface RefactorPlanInput {
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

export interface RefactorPlanDeps {
  cwd: string;
  session: WorkspaceCodeIntelligenceSession;
  /** Semantic provider for refactor planning. */
  provider: SemanticProvider | null;
}

/**
 * Execute the refactor plan use-case.
 *
 * Returns a CodeIntelResult with a stored planId on success, or an
 * error result on invalid input or unavailable provider.
 */
export async function executeRefactorPlan(
  input: RefactorPlanInput,
  deps: RefactorPlanDeps,
): Promise<CodeIntelResult> {
  const normalizedOperation = normalizeRequestedOperation(input.operation);
  if (normalizedOperation.kind === "error") {
    return {
      content: normalizedOperation.message,
      details: unavailableSearchDetails(null, [
        'Use one of: "rename", "rename_symbol", "extract_function", "extract_variable"',
      ]),
    };
  }
  const operation = normalizedOperation.operation;

  const target = resolveRefactorTarget(input, operation, deps.session);
  if ("content" in target) return target;

  const resolvedFile = normalizePath(target.file, deps.cwd);
  const position = toLspPosition(target.line, target.character);

  const refactorResult = await planRefactorWithProvider(deps.provider, {
    operation,
    file: resolvedFile,
    position,
    range: input.range ? toLspRange(input.range) : undefined,
    newName: input.newName,
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
    input.newName ?? "",
  );

  const plan: RefactorPlan = {
    id: planId,
    operation,
    newName: input.newName,
    targetFile: resolvedFile,
    targetLine: target.line,
    targetCharacter: target.character,
    edits: refactorResult.edits,
    fileFingerprints,
    createdAt: Date.now(),
  };
  deps.session.storePlan(plan);

  const editEvidence = createEvidenceList({
    key: "refactor.edits",
    items: refactorResult.edits.edits,
    maxResults: 5,
  }).metadata;
  const content = renderRefactorPlanResult(plan, deps.cwd);

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
        nextQueries: [`Use code_refactor_apply with planId: "${planId}" to apply this refactor`],
      },
    },
  };
}

// ── Validation ────────────────────────────────────────────────────────

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: target expansion and operation-specific validation are kept together for clear user-facing errors.
function resolveRefactorTarget(
  input: RefactorPlanInput,
  operation: CanonicalRefactorOperation,
  session: WorkspaceCodeIntelligenceSession,
): CodeIntelResult | { file: string; line: number; character: number } {
  const expansion = session.expandTargetId(input);
  if (expansion.kind === "error") {
    return {
      content: expansion.message,
      details: unavailableSearchDetails(null, [
        "Verify the `targetId` is valid and from this session",
      ]),
    };
  }
  if (expansion.kind === "ok") {
    input.file = expansion.file;
    input.line = expansion.line;
    input.character = expansion.character;

    // Per ADR 0003: rename_symbol is position-strict — LSP rename requires
    // the identifier (name anchor), and a declaration anchor silently yields
    // empty or wrong edits. Refuse before planning.
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

  if (!input.file) {
    return {
      content:
        "**Error:** Refactor preview requires a `file`. Provide `targetId` (from `code_resolve`) or `file` + `line` + `character`.",
      details: unavailableSearchDetails(null, [
        "Provide `targetId` from `code_resolve` or `file` + `line` + `character`",
      ]),
    };
  }

  if (isExtractOperation(operation) && input.range) {
    const rangeError = validatePublicRange(input.range);
    if (rangeError) {
      return {
        content: rangeError,
        details: unavailableSearchDetails(null, ["Ensure `range.end` is after `range.start`"]),
      };
    }
    if (input.line == null || input.character == null) {
      input.line = input.range.start.line;
      input.character = input.range.start.character;
    }
  }

  if (input.line == null || input.character == null) {
    return {
      content:
        "**Error:** Refactor preview requires `line` and `character`. Provide `targetId` (from `code_resolve`) or `file` + `line` + `character`.",
      details: unavailableSearchDetails(null, [
        "Provide `targetId` from `code_resolve` or `file` + `line` + `character`",
      ]),
    };
  }

  if ((operation === "rename_symbol" || isExtractOperation(operation)) && !input.newName) {
    return {
      content: `**Error:** Refactor preview requires \`newName\` for \`${operation}\`.`,
      details: unavailableSearchDetails(null, [`Provide \`newName\` for \`${operation}\``]),
    };
  }

  if (isExtractOperation(operation) && !input.range) {
    return {
      content: `**Error:** Refactor preview requires \`range\` for \`${operation}\`.`,
      details: unavailableSearchDetails(null, [`Provide a 1-based \`range\` for \`${operation}\``]),
    };
  }

  return {
    file: input.file,
    line: input.line,
    character: input.character,
  };
}

// ── Provider interaction ──────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────

function isExtractOperation(operation: CanonicalRefactorOperation): boolean {
  return operation === "extract_function" || operation === "extract_variable";
}

function validatePublicRange(range: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}): string | null {
  if (
    range.end.line < range.start.line ||
    (range.end.line === range.start.line && range.end.character <= range.start.character)
  ) {
    return "**Error:** Refactor preview requires `range.end` to be after `range.start`.";
  }
  return null;
}

function toLspRange(range: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}): SourceRange {
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
