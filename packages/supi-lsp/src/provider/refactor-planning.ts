import type { CodePosition, RefactorResult } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeAction, TextDocumentEdit, TextEdit, WorkspaceEdit } from "../config/types.ts";
import type { SessionLspService } from "../session/service-registry.ts";

export async function runRenameRefactor(
  lsp: SessionLspService,
  file: string,
  position: CodePosition,
  newName: string,
): Promise<RefactorResult> {
  const edit = await lsp.rename(file, position, newName);
  return convertLspWorkspaceEdit(edit);
}

export function collectCodeActionResults(actions: CodeAction[]): RefactorResult[] {
  const results: RefactorResult[] = [];
  for (const action of actions) {
    if (!action.edit) {
      results.push({
        kind: "unavailable",
        reason: `Code action "${action.title}" has no edit`,
      });
      continue;
    }

    const result = convertCodeActionToResult(action);
    results.push(
      result?.kind === "precise"
        ? result
        : {
            kind: "unavailable",
            reason: `Code action "${action.title}" could not produce precise edits`,
          },
    );
  }
  return results;
}

export async function runFilteredCodeActionRefactor(options: {
  lsp: SessionLspService;
  file: string;
  position: CodePosition;
  operation: "update_imports" | "delete_dead_code";
  matches: (action: CodeAction) => boolean;
}): Promise<RefactorResult> {
  const { lsp, file, position, operation, matches } = options;
  const actions = await lsp.codeActions(file, position);
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

  for (const action of matching) {
    const converted = convertCodeActionToResult(action);
    if (converted?.kind === "precise") {
      return converted;
    }
  }

  return {
    kind: "unavailable",
    reason: `Matching code actions for refactor operation "${operation}" did not produce precise edits.`,
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

function convertCodeActionToResult(action: CodeAction): RefactorResult | null {
  if (!action.edit) {
    return null;
  }
  return convertLspWorkspaceEdit(action.edit);
}

function convertLspWorkspaceEdit(edit: WorkspaceEdit | null): RefactorResult {
  if (!edit) {
    return { kind: "unavailable", reason: "LSP server returned no edit" };
  }

  let fileEdits = edit.documentChanges?.length
    ? collectDocumentChangeEdits(edit.documentChanges)
    : [];
  if (fileEdits.length === 0 && edit.changes) {
    fileEdits = collectChangesEdits(edit.changes);
  }

  if (fileEdits.length === 0) {
    return { kind: "unavailable", reason: "Workspace edit contains no file edits" };
  }

  return { kind: "precise", edits: { edits: fileEdits } };
}

function resolveFileFromUri(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  try {
    return decodeURIComponent(uri.slice(7));
  } catch {
    return uri;
  }
}

function collectDocumentChangeEdits(
  docChanges: NonNullable<WorkspaceEdit["documentChanges"]>,
): Array<{
  file: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  newText: string;
}> {
  const out: Array<{
    file: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    newText: string;
  }> = [];
  for (const change of docChanges) {
    const tdEdit = change as TextDocumentEdit;
    if (!tdEdit.textDocument || !tdEdit.edits) continue;
    const file = resolveFileFromUri(tdEdit.textDocument.uri);
    for (const singleEdit of tdEdit.edits) {
      const te = singleEdit as TextEdit;
      out.push({
        file,
        range: {
          start: { line: te.range.start.line, character: te.range.start.character },
          end: { line: te.range.end.line, character: te.range.end.character },
        },
        newText: te.newText,
      });
    }
  }
  return out;
}

function collectChangesEdits(changes: NonNullable<WorkspaceEdit["changes"]>): Array<{
  file: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  newText: string;
}> {
  const out: Array<{
    file: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    newText: string;
  }> = [];
  for (const [uri, textEdits] of Object.entries(changes)) {
    if (!textEdits || textEdits.length === 0) continue;
    const file = resolveFileFromUri(uri);
    for (const te of textEdits) {
      out.push({
        file,
        range: {
          start: { line: te.range.start.line, character: te.range.start.character },
          end: { line: te.range.end.line, character: te.range.end.character },
        },
        newText: te.newText,
      });
    }
  }
  return out;
}
