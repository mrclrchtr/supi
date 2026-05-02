// Callees action — best-effort outgoing call map using Tree-sitter.

import * as path from "node:path";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter";
import { resolveTarget } from "../resolve-target.ts";
import type { ActionParams } from "../tool-actions.ts";

export async function executeCalleesAction(params: ActionParams, cwd: string): Promise<string> {
  const target = await resolveTarget(params, cwd);
  if (typeof target === "string") return target;

  const relPath = path.relative(cwd, target.file);
  let tsSession: ReturnType<typeof createTreeSitterSession> | null = null;

  try {
    tsSession = createTreeSitterSession(cwd);
    const outlineResult = await tsSession.outline(relPath);
    if (outlineResult.kind !== "success") {
      return noCalleesMessage(relPath, target.displayLine, target.displayCharacter);
    }

    const enclosing = outlineResult.data.find(
      (item) =>
        item.range.startLine - 1 <= target.position.line &&
        item.range.endLine - 1 >= target.position.line,
    );

    if (!enclosing) {
      return noCalleesMessage(relPath, target.displayLine, target.displayCharacter);
    }

    const callees = await findCallees(tsSession, relPath, enclosing);
    if (callees.length === 0) {
      return noCalleesMessage(relPath, target.displayLine, target.displayCharacter);
    }

    return formatCallees(callees, enclosing.name, relPath, params.maxResults ?? 8);
  } catch {
    return noCalleesMessage(relPath, target.displayLine, target.displayCharacter);
  } finally {
    tsSession?.dispose();
  }
}

interface CalleeEntry {
  name: string;
  line: number;
}

async function findCallees(
  ts: ReturnType<typeof createTreeSitterSession>,
  relPath: string,
  enclosing: { name: string; range: { startLine: number; endLine: number } },
): Promise<CalleeEntry[]> {
  const queryStr =
    "(call_expression function: (_) @callee) (new_expression constructor: (_) @callee)";
  const queryResult = await ts.query(relPath, queryStr);

  if (queryResult.kind !== "success") return [];

  const filtered = queryResult.data.filter(
    (c) =>
      c.range.startLine >= enclosing.range.startLine &&
      c.range.startLine <= enclosing.range.endLine,
  );

  const seen = new Set<string>();
  const callees: CalleeEntry[] = [];
  for (const c of filtered) {
    const name = c.text.replace(/\s+/g, "").slice(0, 60);
    if (!seen.has(name)) {
      seen.add(name);
      callees.push({ name, line: c.range.startLine });
    }
  }
  return callees;
}

function formatCallees(
  callees: CalleeEntry[],
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
    lines.push(`- \`${c.name}\` (L${c.line})`);
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
  return `No callee data available for ${relPath}:${line}:${char}.\n\nUse \`tree_sitter\` with \`action: "outline"\` or \`action: "node_at"\` for structural drill-down.`;
}
