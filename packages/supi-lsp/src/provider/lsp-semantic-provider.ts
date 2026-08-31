// LSP semantic provider adapter — wraps WorkspaceLspRuntime into the shared
// SemanticProvider contract from supi-code-runtime.

import {
  type CodeLocation,
  type CodePosition,
  type CodeQueryResult,
  type CodeRequestControl,
  type CodeSymbol,
  completedCodeQuery,
  type DocumentCodeSymbol,
  mapCodeQueryResult,
  partialCodeQuery,
  type SemanticProvider,
  type SourceRange,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import type { SymbolInformation } from "../config/types.ts";
import type { WorkspaceLspRuntime } from "../session/runtime-registry.ts";
import { createLspRefactorProvider } from "./lsp-refactor-provider.ts";
import {
  convertLspHover,
  mapDocumentSymbols,
  mapLocations,
  toCodeSymbol,
} from "./semantic-symbol-mapper.ts";

/**
 * Create a SemanticProvider backed by a WorkspaceLspRuntime.
 * Maps LSP types into the shared code-runtime types.
 */
export function createLspSemanticProvider(lsp: WorkspaceLspRuntime): SemanticProvider {
  return {
    async definition(
      filePath: string,
      position: CodePosition,
      control?: CodeRequestControl,
    ): Promise<CodeQueryResult<CodeLocation[]>> {
      const result = control
        ? await lsp.definition(filePath, position, control)
        : await lsp.definition(filePath, position);
      return mapCodeQueryResult(result, mapLocations);
    },

    async hover(
      filePath: string,
      position: CodePosition,
      control?: CodeRequestControl,
    ): Promise<CodeQueryResult<{ contents: string; range?: SourceRange } | null>> {
      const result = control
        ? await lsp.hover(filePath, position, control)
        : await lsp.hover(filePath, position);
      return mapCodeQueryResult(result, (hover) => (hover ? convertLspHover(hover) : null));
    },

    async references(
      filePath: string,
      position: CodePosition,
      control?: CodeRequestControl,
    ): Promise<CodeQueryResult<CodeLocation[]>> {
      const result = control
        ? await lsp.references(filePath, position, control)
        : await lsp.references(filePath, position);
      return mapCodeQueryResult(result, mapLocations);
    },

    async implementation(
      filePath: string,
      position: CodePosition,
      control?: CodeRequestControl,
    ): Promise<CodeQueryResult<CodeLocation[]>> {
      const result = control
        ? await lsp.implementation(filePath, position, control)
        : await lsp.implementation(filePath, position);
      return mapCodeQueryResult(result, mapLocations);
    },

    async documentSymbols(
      filePath: string,
      control?: CodeRequestControl,
    ): Promise<CodeQueryResult<DocumentCodeSymbol[]>> {
      const result = control
        ? await lsp.documentSymbols(filePath, control)
        : await lsp.documentSymbols(filePath);
      if (result.kind === "unavailable") return unavailableCodeQuery(result.reason);
      const symbols = await mapDocumentSymbols(result.data, filePath);
      return result.kind === "partial"
        ? partialCodeQuery(symbols, result.reason)
        : completedCodeQuery(symbols);
    },

    async workspaceSymbols(
      query: string,
      control?: CodeRequestControl,
      scopes?: readonly string[],
    ): Promise<CodeQueryResult<CodeSymbol[]>> {
      const result = await lsp.workspaceSymbol(query, control, scopes);
      return mapCodeQueryResult(result, (results) =>
        results.flatMap((symbol) => {
          const mapped = toCodeSymbol(symbol as SymbolInformation);
          return mapped ? [mapped] : [];
        }),
      );
    },

    ...createLspRefactorProvider(lsp),
  };
}
