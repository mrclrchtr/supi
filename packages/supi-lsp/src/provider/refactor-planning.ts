import type { CodePosition, RefactorResult, SourceRange } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeAction } from "../config/types.ts";
import type { WorkspaceLspRuntime } from "../session/runtime-registry.ts";
import {
  normalizeSemanticEdit,
  type SemanticEditNormalizationContext,
} from "./semantic-edit-normalizer.ts";

export async function runRenameRefactor(
  lsp: WorkspaceLspRuntime,
  file: string,
  position: CodePosition,
  newName: string,
): Promise<RefactorResult> {
  const edit = await lsp.rename(file, position, newName);
  return normalizeSemanticEdit({ kind: "workspace-edit", edit }, lsp);
}

/**
 * Normalize code-action edits. Without document state, versioned changes fail closed.
 */
export function collectCodeActionResults(
  actions: CodeAction[],
  context: SemanticEditNormalizationContext = { getOpenDocumentVersion: () => null },
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
  operation: "update_imports" | "delete_dead_code" | "extract_function" | "extract_variable";
  range?: SourceRange;
  matches: (action: CodeAction) => boolean;
}): Promise<RefactorResult> {
  const { lsp, file, position, operation, matches } = options;
  const actions = await lsp.codeActions(file, options.range ?? position);
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

  let unavailableReason: string | null = null;
  for (const action of matching) {
    const converted = normalizeSemanticEdit({ kind: "code-action", action }, lsp);
    if (converted.kind === "precise") return converted;
    if (converted.kind === "unavailable") unavailableReason ??= converted.reason;
  }

  return {
    kind: "unavailable",
    reason: unavailableReason
      ? `Matching code action is unavailable: ${unavailableReason}`
      : `Matching code actions for refactor operation "${operation}" did not produce precise edits.`,
  };
}

export function isUpdateImportsCodeAction(action: CodeAction): boolean {
  const kind = action.kind ?? "";
  const title = action.title.trim().toLowerCase();
  const kindlessTitleMatch = kind === "" && title === "organize imports";
  return (
    kind === "source.organizeImports" ||
    kind.startsWith("source.organizeImports.") ||
    kindlessTitleMatch
  );
}

export function isExtractFunctionCodeAction(action: CodeAction): boolean {
  const kind = action.kind ?? "";
  const title = action.title.trim().toLowerCase();
  return (
    kind === "refactor.extract.function" ||
    kind.startsWith("refactor.extract.function.") ||
    (title.includes("extract") && /\b(function|method)\b/.test(title))
  );
}

export function isExtractVariableCodeAction(action: CodeAction): boolean {
  const kind = action.kind ?? "";
  const title = action.title.trim().toLowerCase();
  return (
    kind === "refactor.extract.constant" ||
    kind.startsWith("refactor.extract.constant.") ||
    kind === "refactor.extract.variable" ||
    kind.startsWith("refactor.extract.variable.") ||
    (title.includes("extract") && /\b(constant|const|variable)\b/.test(title))
  );
}

export function isDeleteDeadCodeCodeAction(action: CodeAction): boolean {
  const kind = action.kind ?? "";
  const title = action.title.trim().toLowerCase();
  const kindMatches =
    kind === "quickfix" ||
    kind.startsWith("quickfix.") ||
    kind === "refactor.rewrite" ||
    kind.startsWith("refactor.rewrite.");
  const titleMatches =
    /(unused|dead code|remove unused|remove unreachable|remove declaration)/.test(title);
  return kindMatches && titleMatches;
}
