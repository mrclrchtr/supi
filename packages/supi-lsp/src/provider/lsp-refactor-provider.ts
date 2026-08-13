import type {
  CodeRequestControl,
  RefactorRequest,
  RefactorResult,
  SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import type { CodeAction } from "../config/types.ts";
import type { WorkspaceLspRuntime } from "../session/runtime-registry.ts";
import {
  collectCodeActionResults,
  isDeleteDeadCodeCodeAction,
  isExtractFunctionCodeAction,
  isExtractVariableCodeAction,
  isUpdateImportsCodeAction,
  runFilteredCodeActionRefactor,
  runRenameRefactor,
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
      if (!response?.value) return [];
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
      if (!request.newName) {
        return {
          kind: "unavailable",
          reason: 'Refactor operation "rename_symbol" requires `newName`.',
        };
      }
      return runRenameRefactor({
        lsp,
        file: request.file,
        position: request.position,
        newName: request.newName,
        control,
      });
    case "extract_function":
      return runExtractRefactor({
        lsp,
        request,
        operation: "extract_function",
        matches: isExtractFunctionCodeAction,
        control,
      });
    case "extract_variable":
      return runExtractRefactor({
        lsp,
        request,
        operation: "extract_variable",
        matches: isExtractVariableCodeAction,
        control,
      });
    case "update_imports":
      return runFilteredCodeActionRefactor({
        lsp,
        file: request.file,
        position: request.position,
        operation: "update_imports",
        matches: isUpdateImportsCodeAction,
        control,
      });
    case "delete_dead_code":
      return runFilteredCodeActionRefactor({
        lsp,
        file: request.file,
        position: request.position,
        operation: "delete_dead_code",
        matches: isDeleteDeadCodeCodeAction,
        control,
      });
    case "rename_file":
    case "move_file":
      return {
        kind: "unavailable",
        reason: `Refactor operation "${request.operation}" is not supported yet. File/resource operations are deferred.`,
      };
  }
  return {
    kind: "unavailable",
    reason: `Refactor operation "${request.operation}" is not supported by the active semantic provider.`,
  };
}

function runExtractRefactor(options: {
  lsp: WorkspaceLspRuntime;
  request: RefactorRequest;
  operation: "extract_function" | "extract_variable";
  matches: (action: CodeAction) => boolean;
  control?: CodeRequestControl;
}): Promise<RefactorResult> | RefactorResult {
  const { lsp, request, operation, matches, control } = options;
  if (!request.range) {
    return {
      kind: "unavailable",
      reason: `Refactor operation "${operation}" requires \`range\`.`,
    };
  }
  return runFilteredCodeActionRefactor({
    lsp,
    file: request.file,
    position: request.position,
    range: request.range,
    operation,
    matches,
    control,
  });
}
