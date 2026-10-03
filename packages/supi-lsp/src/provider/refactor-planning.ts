import type {
  CodePosition,
  CodeRequestControl,
  RefactorResult,
  SourceRange,
} from "@mrclrchtr/supi-code-runtime/api";
import { CodeActionTriggerKind } from "vscode-languageserver-types";
import { codeActionKindsForOperation } from "../config/operation-support.ts";
import type { CodeAction } from "../config/types.ts";
import type { WorkspaceLspRuntime } from "../session/runtime-registry.ts";
import {
  normalizeSemanticEdit,
  type SemanticEditNormalizationContext,
} from "./semantic-edit-normalizer.ts";

export async function runRenameRefactor(options: {
  lsp: WorkspaceLspRuntime;
  file: string;
  position: CodePosition;
  newName: string;
  control?: CodeRequestControl;
}): Promise<RefactorResult> {
  const { lsp, file, position, newName, control } = options;
  const response = control
    ? await lsp.rename(file, position, newName, control)
    : await lsp.rename(file, position, newName);
  if (!response) {
    return { kind: "unavailable", reason: "No routed LSP client could plan the rename." };
  }
  if (!response.value) {
    return {
      kind: "unavailable",
      reason: response.reason ?? "No routed LSP client could plan the rename.",
      authorizedMutationRoots: [...response.authorizedMutationRoots],
    };
  }
  return normalizeSemanticEdit(
    { kind: "workspace-edit", edit: response.value },
    {
      getOpenDocumentVersion: (candidate) => lsp.getOpenDocumentVersion(candidate),
      authorizedMutationRoots: response.authorizedMutationRoots,
    },
  );
}

/**
 * Normalize code-action edits. Without document state, versioned changes fail closed.
 */
export function collectCodeActionResults(
  actions: CodeAction[],
  context: SemanticEditNormalizationContext,
): RefactorResult[] {
  const results: RefactorResult[] = [];
  for (const action of actions) {
    results.push(normalizeSemanticEdit({ kind: "code-action", action }, context));
  }
  return results;
}

export async function runFilteredCodeActionRefactor(options: {
  lsp: WorkspaceLspRuntime;
  file: string;
  position: CodePosition;
  operation: "update_imports" | "delete_dead_code";
  range?: SourceRange;
  matches: (action: CodeAction) => boolean;
  control?: CodeRequestControl;
}): Promise<RefactorResult> {
  const { lsp, file, position, operation, matches } = options;
  const response = await lsp.codeActions(file, options.range ?? position, options.control, {
    only: codeActionKindsForOperation(operation),
    triggerKind: CodeActionTriggerKind.Invoked,
  });
  if (!response || response.reason) {
    return {
      kind: "unavailable",
      reason:
        response?.reason ?? `No code actions are available for refactor operation "${operation}".`,
    };
  }
  const actions = response.value;
  if (!actions || actions.length === 0) {
    return {
      kind: "unavailable",
      reason: `No code actions are available for refactor operation "${operation}".`,
    };
  }

  const matching = actions.filter(matches);
  if (matching.length === 0) {
    return {
      kind: "unavailable",
      reason: `No matching precise code action is available for refactor operation "${operation}".`,
    };
  }

  const context: SemanticEditNormalizationContext = {
    getOpenDocumentVersion: (candidate) => lsp.getOpenDocumentVersion(candidate),
    authorizedMutationRoots: response.authorizedMutationRoots,
  };
  const plans = collectPrecisePlans(matching, context);
  if (plans.precise.length === 1) return plans.precise[0].result;
  if (plans.precise.length > 1) {
    return {
      kind: "ambiguous",
      candidates: plans.precise.map(({ action, result }, index) =>
        refactorCandidate(action, result, index, plans.precise),
      ),
    };
  }
  return {
    kind: "unavailable",
    reason: plans.unavailableReason
      ? `Matching code action is unavailable: ${plans.unavailableReason}`
      : `Matching code actions for refactor operation "${operation}" did not produce precise edits.`,
  };
}

export function isUpdateImportsCodeAction(action: CodeAction): boolean {
  const kind = typeof action?.kind === "string" ? action.kind : "";
  return kind === "source.organizeImports" || kind.startsWith("source.organizeImports.");
}

export function isDeleteDeadCodeCodeAction(action: CodeAction): boolean {
  const kind = typeof action?.kind === "string" ? action.kind : "";
  return kind === "source.removeUnused" || kind.startsWith("source.removeUnused.");
}

interface PreciseCodeActionPlan {
  action: CodeAction;
  result: Extract<RefactorResult, { kind: "precise" }>;
}

function collectPrecisePlans(
  actions: readonly CodeAction[],
  context: SemanticEditNormalizationContext,
): { precise: PreciseCodeActionPlan[]; unavailableReason: string | null } {
  const precise: PreciseCodeActionPlan[] = [];
  const planKeys = new Set<string>();
  let unavailableReason: string | null = null;
  for (const action of actions) {
    const converted = normalizeSemanticEdit({ kind: "code-action", action }, context);
    if (converted.kind === "precise") {
      const key = normalizedPlanKey(converted);
      if (!planKeys.has(key)) {
        planKeys.add(key);
        precise.push({ action, result: converted });
      }
      continue;
    }
    if (converted.kind === "unavailable") unavailableReason ??= converted.reason;
  }
  return { precise, unavailableReason };
}

function normalizedPlanKey(result: Extract<RefactorResult, { kind: "precise" }>): string {
  const edits = result.edits.edits
    .map((edit) => ({
      file: edit.file,
      start: edit.range.start,
      end: edit.range.end,
      newText: edit.newText,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const preconditions = [...(result.edits.documentPreconditions ?? [])].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
  return JSON.stringify({ edits, preconditions });
}

function refactorCandidate(
  action: CodeAction,
  result: Extract<RefactorResult, { kind: "precise" }>,
  index: number,
  plans: readonly { action: CodeAction }[],
): {
  description: string;
  file?: string;
  line?: number;
  character?: number;
} {
  const firstEdit = result.edits.edits[0];
  const sameTitleCount = plans.filter((plan) => plan.action.title === action.title).length;
  const description =
    sameTitleCount > 1 ? `${action.title} (alternative ${index + 1})` : action.title;
  return {
    description,
    ...(firstEdit
      ? {
          file: firstEdit.file,
          line: firstEdit.range.start.line + 1,
          character: firstEdit.range.start.character + 1,
        }
      : {}),
  };
}
