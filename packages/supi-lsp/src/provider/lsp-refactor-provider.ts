import type {
  CodeRequestControl,
  RefactorRequest,
  RefactorResult,
  SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import type { WorkspaceLspRuntime } from "../session/runtime-registry.ts";
import {
  collectCodeActionResults,
  runCodeActionRefactor,
  runRenameRefactor,
  runSourceActionRefactor,
  wholeDocumentRange,
} from "./refactor-planning.ts";

/** Build optional refactor methods for the semantic provider adapter. */
export function createLspRefactorProvider(
  lsp: WorkspaceLspRuntime,
): Pick<SemanticProvider, "refactor" | "rename" | "codeActions"> {
  return {
    refactor: (request, control) => planRefactor(lsp, request, control),
    rename: (file, position, newName, control) =>
      runRenameRefactor({ lsp, file, position, newName, control }),
    async codeActions(file, position, control) {
      const response = control
        ? await lsp.codeActions(file, position, control)
        : await lsp.codeActions(file, position);
      if (!response) return [];
      if (response.reason && !response.value) {
        return [{ kind: "unavailable", reason: response.reason }];
      }
      if (!response.value) return [];
      return collectCodeActionResults(response.value, {
        getOpenDocumentVersion: (candidate) => lsp.getOpenDocumentVersion(candidate),
        authorizedMutationRoots: response.authorizedMutationRoots,
      });
    },
  };
}

async function planRefactor(
  lsp: WorkspaceLspRuntime,
  request: RefactorRequest,
  control?: CodeRequestControl,
): Promise<RefactorResult> {
  switch (request.operation) {
    case "rename_symbol":
      return runRenameRefactor({
        lsp,
        file: request.file,
        position: request.position,
        newName: request.newName,
        control,
      });
    case "code_action":
      return runCodeActionRefactor({
        lsp,
        file: request.file,
        range: request.range,
        kind: request.kind,
        title: request.title,
        label: "Code action",
        control,
      });
    case "source_action": {
      // LSP source actions apply to the entire file, so request the whole document.
      const range = wholeDocumentRange(request.file);
      if (!range) {
        return { kind: "unavailable", reason: `File ${request.file} could not be read.` };
      }
      return runSourceActionRefactor({
        lsp,
        file: request.file,
        range,
        kind: request.kind,
        title: request.title,
        label: "Source action",
        control,
      });
    }
  }
}
