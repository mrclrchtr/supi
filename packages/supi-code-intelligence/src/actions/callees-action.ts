// Callees action — structural outgoing call map via Tree-sitter.
// Orchestrates target resolution and formatting; delegates grammar-aware
// extraction to @mrclrchtr/supi-tree-sitter/api.

import * as path from "node:path";
import type { CodeQueryParams as ActionParams } from "../query-params.ts";
import { resolveTarget } from "../resolve-target.ts";
import { isResolvedTargetGroup } from "../semantic-action-helpers.ts";
import type { SemanticSubstrate, StructuralSubstrate } from "../substrates/types.ts";
import type { CodeIntelResult, SearchDetails } from "../types.ts";

export async function executeCalleesAction(
  params: ActionParams,
  cwd: string,
  structural: StructuralSubstrate,
  semantic?: SemanticSubstrate,
): Promise<CodeIntelResult> {
  const target = await resolveTarget(params, cwd, semantic);
  if (typeof target === "string") {
    return {
      content: target,
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable",
          scope: null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Provide `file`, `line`, `character` or a `symbol` to resolve the target"],
        },
      },
    };
  }

  if (isResolvedTargetGroup(target)) {
    return {
      content: `**Error:** File-level callee discovery is not available for \`${path.relative(cwd, target.file)}\`.\n\nProvide \`line\` and \`character\`, or a \`symbol\` for discovery.`,
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable",
          scope: params.path ?? null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Use `file` + coordinates or `symbol` for callee lookup"],
        },
      },
    };
  }

  const relPath = path.relative(cwd, target.file);

  try {
    const result = await structural.calleesAt(relPath, target.displayLine, target.displayCharacter);

    if (result.kind !== "success") {
      return {
        content: noCalleesMessage(relPath, target.displayLine, target.displayCharacter),
        details: {
          type: "search" as const,
          data: {
            confidence: "unavailable",
            scope: null,
            candidateCount: 0,
            omittedCount: 0,
            nextQueries: [
              "Use `lsp_hover` with `file`, `line`, and `character` for type-aware analysis on this file",
            ],
          },
        },
      };
    }

    const { enclosingScope, callees } = result.data;

    if (callees.length === 0) {
      return {
        content: noCalleesMessage(relPath, target.displayLine, target.displayCharacter),
        details: {
          type: "search" as const,
          data: {
            confidence: "structural",
            scope: null,
            candidateCount: 0,
            omittedCount: 0,
            nextQueries: [
              "Use `tree_sitter_outline` with `file` to explore the enclosing function",
            ],
          },
        },
      };
    }

    const content = formatCallees(callees, enclosingScope.name, relPath, params.maxResults ?? 8);
    const details: SearchDetails = {
      confidence: "structural",
      scope: null,
      candidateCount: callees.length,
      omittedCount: Math.max(0, callees.length - (params.maxResults ?? 8)),
      nextQueries: [
        "Use `lsp_hover` with `file`, `line`, and `character` for precise type information on callees",
      ],
    };
    return { content, details: { type: "search" as const, data: details } };
  } catch {
    return {
      content: noCalleesMessage(relPath, target.displayLine, target.displayCharacter),
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable",
          scope: null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: [
            "Use `lsp_hover` with `file`, `line`, and `character` for type-aware analysis on this file",
          ],
        },
      },
    };
  }
}

function formatCallees(
  callees: Array<{ name: string; startLine: number }>,
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
    lines.push(`- \`${c.name}\` (L${c.startLine})`);
  }
  if (callees.length > maxResults) {
    lines.push(`- _+${callees.length - maxResults} more_`);
  }
  lines.push("");
  lines.push(
    "_Structural analysis — may include unresolved or qualified names. Use `lsp_hover` with `file`, `line`, and `character` for precise type information._",
  );
  lines.push("");
  return lines.join("\n");
}

function noCalleesMessage(relPath: string, line: number, char: number): string {
  return `No callee data available for ${relPath}:${line}:${char}.\n\nUse \`tree_sitter_callees\` with \`file\`, \`line\`, and \`character\` for structural drill-down.`;
}
