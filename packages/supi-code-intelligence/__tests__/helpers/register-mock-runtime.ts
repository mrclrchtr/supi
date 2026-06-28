/**
 * Shared test helper: register mock capabilities into the shared workspace
 * runtime for a given cwd.
 *
 * Replaces the old registerMockProvider helper that used CodeProvider
 * registry directly.
 */

import { existsSync, readFileSync } from "node:fs";
import type { CodeSymbol } from "@mrclrchtr/supi-code-runtime/api";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeProvider } from "../../src/analysis/provider.ts";

/**
 * A `documentSymbols` mock that scans the file on disk and synthesizes
 * `CodeSymbol` entries for top-level declarations (with both a declaration
 * anchor at the line start and a name anchor at the identifier). Used as the
 * default so anchored/file-level resolution has provider-backed evidence
 * without each test spelling out symbols by hand.
 */
export function fileDocumentSymbolsMock(): NonNullable<CodeProvider["documentSymbols"]> {
  return async (filePath: string): Promise<CodeSymbol[] | null> => {
    try {
      if (!existsSync(filePath)) return null;
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const symbols: CodeSymbol[] = [];
      const declRe =
        /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(function|class|interface|enum|type|const|let|var)\s+([A-Za-z_$][\w$]*)/;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = declRe.exec(line);
        if (!m) continue;
        const keyword = m[1];
        const name = m[2];
        const declChar = line.search(/\S/) + 1; // 1-based
        // Name (identifier) sits at the end of the full match; derive its
        // 1-based column from the match span so a single-char name that also
        // occurs inside `export`/`const` (e.g. `export const x`) is positioned
        // at the identifier, not the earlier keyword occurrence.
        const nameChar = (m.index ?? 0) + m[0].length - name.length + 1; // 1-based
        if (nameChar <= 0) continue;
        symbols.push({
          name,
          kind: kindForKeyword(keyword),
          file: filePath,
          declarationAnchor: { line: i + 1, character: declChar },
          nameAnchor: { line: i + 1, character: nameChar },
          container: null,
        });
      }
      return symbols;
    } catch {
      return null;
    }
  };
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

/**
 * Register a mock CodeProvider's worth of capabilities for cwd.
 * Sets up both semantic and structural mock providers in the shared runtime.
 */
export function registerMockProvider(cwd: string, overrides: Partial<CodeProvider> = {}): void {
  const runtime = getDefaultWorkspaceRuntime();

  const noopSemantic = async () => null;
  const noopStructural = async (_file: string) =>
    ({ kind: "unsupported-language" as const, file: _file, message: "mock" }) as const;

  // Register semantic provider
  runtime.registerSemantic(cwd, {
    references: overrides.references ?? noopSemantic,
    implementation: overrides.implementation ?? noopSemantic,
    documentSymbols: overrides.documentSymbols ?? fileDocumentSymbolsMock(),
    workspaceSymbols: overrides.workspaceSymbols ?? noopSemantic,
    hover: overrides.hover,
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
}
