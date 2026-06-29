/**
 * Semantic search support for the pattern/find use-case.
 *
 * LSP workspace-symbol search with scope filtering and markdown rendering.
 * Extracted from orchestrate.ts to keep the main use-case under the
 * file-line limit.
 */

import type { CodeSymbol } from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";
import { createEvidenceList, renderEvidenceListDisclosure } from "../../analysis/evidence.ts";
import type { CodeProvider } from "../../analysis/provider.ts";
import { normalizePath } from "../../analysis/search/ripgrep.ts";
import type { CodeIntelResult, SearchDetails } from "../../types/index.ts";
import type { PatternInput } from "./orchestrate.ts";

export async function executeSemanticSearch(
  input: PatternInput,
  provider: CodeProvider | null,
  cwd: string,
): Promise<CodeIntelResult> {
  if (!provider?.workspaceSymbols) {
    throw new Error(
      "code_find semantic search is unavailable because no semantic/LSP provider is active for this workspace.",
    );
  }

  const symbols = await provider.workspaceSymbols(input.pattern);
  if (symbols === null) {
    throw new Error(
      "code_find semantic search is unavailable because the active semantic provider cannot serve workspace symbol queries.",
    );
  }

  const scopePath = input.path ? normalizePath(input.path, cwd) : cwd;
  const scopedSymbols = filterSymbolsByScope(symbols, scopePath);
  if (scopedSymbols.length === 0) {
    return renderSemanticEmptyResult(input);
  }

  return renderSemanticResults(input, scopedSymbols, cwd);
}

function filterSymbolsByScope<T extends { file: string }>(symbols: T[], scopePath: string): T[] {
  return symbols.filter((symbol) => isWithinOrEqual(scopePath, symbol.file));
}

function renderSemanticEmptyResult(input: PatternInput): CodeIntelResult {
  const relPath = input.path ?? ".";
  return {
    content: `**Semantic search** — \`${input.pattern}\`\n\nNo semantic results found in \`${relPath}\`.`,
    details: {
      type: "search",
      data: {
        confidence: "semantic",
        scope: input.path ?? null,
        candidateCount: 0,
        omittedCount: 0,
        nextQueries: [
          'Use `mode: "text"` for literal text search',
          'Use `mode: "ast"` with `kind` for structural filtering',
        ],
      } satisfies SearchDetails,
    },
  };
}

function renderSemanticResults(
  input: PatternInput,
  symbols: CodeSymbol[],
  cwd: string,
): CodeIntelResult {
  const max = input.maxResults ?? 8;
  const evidence = createEvidenceList({
    key: "find.semanticSymbols",
    items: symbols,
    maxResults: max,
  });

  const lines = [
    `**Semantic search** — \`${input.pattern}\` (${symbols.length} symbol${symbols.length !== 1 ? "s" : ""} found)`,
  ];

  for (const sym of evidence.items) {
    const kindLabel = sym.kind ? ` [${sym.kind}]` : "";
    const container = sym.container ? ` (in ${sym.container})` : "";
    const fileRel = sym.file.startsWith(cwd) ? sym.file.slice(cwd.length + 1) : sym.file;
    const anchor = sym.nameAnchor ?? sym.declarationAnchor;
    lines.push(`- \`${sym.name}\`${kindLabel}${container} — \`${fileRel}:${anchor.line}\``);
  }

  const disclosure = renderEvidenceListDisclosure(evidence);
  if (disclosure) {
    lines.push(disclosure);
  }

  return {
    content: lines.join("\n"),
    details: {
      type: "search",
      data: {
        confidence: "semantic",
        scope: input.path ?? null,
        candidateCount: symbols.length,
        omittedCount: evidence.metadata.omittedCount ?? 0,
        evidenceLists: [evidence.metadata],
        nextQueries: [
          'Use `mode: "text"` for literal text search',
          'Use `mode: "ast"` with `kind` for structural filtering',
        ],
      } satisfies SearchDetails,
    },
  };
}
