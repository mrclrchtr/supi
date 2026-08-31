/**
 * Shared test helper: register mock capabilities into the shared workspace
 * runtime for a given cwd.
 *
 * Replaces the old registerMockProvider helper that used CodeProvider
 * registry directly.
 */

import { existsSync, readFileSync } from "node:fs";
import {
  completedCodeQuery,
  type DocumentCodeSymbol,
  getDefaultWorkspaceRuntime,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import {
  clearWorkspaceLspRuntime,
  setWorkspaceLspRuntimeState,
  type WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";
import type { CodeProvider } from "../../src/analysis/provider.ts";

/**
 * A `documentSymbols` mock that scans the file on disk and synthesizes
 * `CodeSymbol` entries for top-level declarations (with both a declaration
 * anchor at the line start and a name anchor at the identifier). Used as the
 * default so anchored/file-level resolution has provider-backed evidence
 * without each test spelling out symbols by hand.
 */
export function fileDocumentSymbolsMock(): NonNullable<CodeProvider["documentSymbols"]> {
  return async (filePath: string) => {
    try {
      if (!existsSync(filePath)) return unavailableCodeQuery("File not found");
      return completedCodeQuery(scanDocumentSymbols(filePath));
    } catch (error) {
      return unavailableCodeQuery(
        error instanceof Error ? error.message : "Document-symbol mock failed",
      );
    }
  };
}

function scanDocumentSymbols(filePath: string): DocumentCodeSymbol[] {
  const lines = readFileSync(filePath, "utf-8").split("\n");
  const symbols: DocumentCodeSymbol[] = [];
  const declaration =
    /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(function|class|interface|enum|type|const|let|var)\s+([A-Za-z_$][\w$]*)/;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = declaration.exec(line);
    if (!match) continue;
    const keyword = match[1];
    const name = match[2];
    const nameCharacter = (match.index ?? 0) + match[0].length - name.length + 1;
    if (nameCharacter <= 0) continue;
    symbols.push({
      name,
      kind: kindForKeyword(keyword),
      file: filePath,
      declarationAnchor: { line: index + 1, character: line.search(/\S/) + 1 },
      nameAnchor: { line: index + 1, character: nameCharacter },
      container: null,
      nesting: "top-level",
    });
  }
  return symbols;
}

function kindForKeyword(keyword: string): string {
  switch (keyword) {
    case "function":
      return "Function";
    case "class":
      return "Class";
    case "interface":
      return "Interface";
    case "enum":
      return "Enum";
    case "type":
      return "Type";
    default:
      return "Variable";
  }
}

const mockCwds = new Set<string>();

/** Register a mock CodeProvider's worth of typed capabilities for cwd. */
export function registerMockProvider(cwd: string, overrides: Partial<CodeProvider> = {}): void {
  const runtime = getDefaultWorkspaceRuntime();
  mockCwds.add(cwd);
  setWorkspaceLspRuntimeState(cwd, {
    kind: "ready",
    runtime: createReadyTestLspRuntime(cwd),
  });

  const noopSemantic = async () => unavailableCodeQuery("not configured");
  const noopStructural = async (_file: string) =>
    ({ kind: "unsupported-language" as const, file: _file, message: "mock" }) as const;

  // Register semantic provider
  runtime.registerSemantic(cwd, {
    references: overrides.references ?? noopSemantic,
    implementation: overrides.implementation ?? noopSemantic,
    documentSymbols: overrides.documentSymbols ?? fileDocumentSymbolsMock(),
    workspaceSymbols: overrides.workspaceSymbols ?? noopSemantic,
    hover: overrides.hover,
    definition: overrides.definition,
    codeActions: overrides.codeActions,
    rename: overrides.rename,
    refactor: overrides.refactor,
  });

  // Register structural provider
  runtime.registerStructural(cwd, {
    calleesAt: overrides.calleesAt ?? noopStructural,
    exports: overrides.exports ?? noopStructural,
    outline: overrides.outline ?? noopStructural,
    imports: overrides.imports ?? noopStructural,
    nodeAt: overrides.nodeAt ?? noopStructural,
    callSites: overrides.callSites ?? noopStructural,
  });
}

/** Clear all mock capabilities from the shared runtime. */
export function clearMockRuntime(): void {
  getDefaultWorkspaceRuntime().clearAll();
  for (const cwd of mockCwds) clearWorkspaceLspRuntime(cwd);
  mockCwds.clear();
}

function createReadyTestLspRuntime(cwd: string): WorkspaceLspRuntime {
  return {
    hover: async () => completedCodeQuery(null),
    definition: async () => completedCodeQuery([]),
    references: async () => completedCodeQuery([]),
    implementation: async () => completedCodeQuery([]),
    documentSymbols: async () => completedCodeQuery([]),
    workspaceSymbol: async () => completedCodeQuery([]),
    fileDiagnostics: async () => completedCodeQuery([]),
    waitUntilReadyForFile: async () => ({ kind: "ready" }),
    waitUntilReadyForWorkspace: async () => ({ kind: "ready" }),
    getProjectServers: () => [
      {
        name: "test-lsp",
        root: cwd,
        fileTypes: ["ts"],
        status: "running",
        openFiles: [],
        ready: true,
      },
    ],
  } as unknown as WorkspaceLspRuntime;
}
