// Callees action — structural outgoing call map via Tree-sitter.
// Orchestrates target resolution and formatting; delegates grammar-aware
// extraction to @mrclrchtr/supi-tree-sitter.

import * as path from "node:path";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter";
import { resolveTarget } from "../resolve-target.ts";
import type { ActionParams } from "../tool-actions.ts";
import type { CodeIntelResult, SearchDetails } from "../types.ts";

export async function executeCalleesAction(
  params: ActionParams,
  cwd: string,
): Promise<CodeIntelResult> {
  const target = await resolveTarget(params, cwd);
  if (typeof target === "string") return { content: target, details: undefined };

  const relPath = path.relative(cwd, target.file);
  let tsSession: ReturnType<typeof createTreeSitterSession> | null = null;

  try {
    tsSession = createTreeSitterSession(cwd);
    const result = await tsSession.calleesAt(relPath, target.displayLine, target.displayCharacter);

    if (result.kind !== "success") {
      return {
        content: noCalleesMessage(relPath, target.displayLine, target.displayCharacter),
        details: undefined,
      };
    }

    const { enclosingScope, callees } = result.data;

    if (callees.length === 0) {
      return {
        content: noCalleesMessage(relPath, target.displayLine, target.displayCharacter),
        details: undefined,
      };
    }

    const content = formatCallees(callees, enclosingScope.name, relPath, params.maxResults ?? 8);
    const details: SearchDetails = {
      confidence: "structural",
      scope: null,
      candidateCount: callees.length,
      omittedCount: Math.max(0, callees.length - (params.maxResults ?? 8)),
      nextQueries: ["Use `lsp` for precise type information on callees"],
    };
    return { content, details: { type: "search" as const, data: details } };
  } catch {
    return {
      content: noCalleesMessage(relPath, target.displayLine, target.displayCharacter),
      details: undefined,
    };
  } finally {
    tsSession?.dispose();
  }
}

function formatCallees(
  callees: Array<{ name: string; range: { startLine: number } }>,
  enclosingName: string,
  relPath: string,
  maxResults: number,
): string {
  const lines: string[] = [];
  lines.push(`# Callees of \`${enclosingName}\` (structural)`);
  lines.push("");
  lines.push(
    `**${callees.length} outgoing call${callees.length > 1 ? "s" : ""}** from \`${enclosingName}\` in \`${relPath}\``,
  );
  lines.push("");

  const shown = callees.slice(0, maxResults);
  for (const c of shown) {
    lines.push(`- \`${c.name}\` (L${c.range.startLine})`);
  }
  if (callees.length > maxResults) {
    lines.push(`- _+${callees.length - maxResults} more_`);
  }
  lines.push("");
  lines.push(
    "_Structural analysis — may include unresolved or qualified names. Use `lsp` for precise type information._",
  );
  lines.push("");
  return lines.join("\n");
}

function noCalleesMessage(relPath: string, line: number, char: number): string {
  return `No callee data available for ${relPath}:${line}:${char}.\n\nUse \`tree_sitter\` with \`action: "callees"\` for structural drill-down.`;
}
