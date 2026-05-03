import {
  type ResolvedTarget,
  resolveAnchoredTarget,
  resolveSymbolTarget,
} from "./target-resolution.ts";
import type { ActionParams } from "./tool-actions.ts";

/**
 * Resolve a target from action params. Returns either a ResolvedTarget
 * or a string error/disambiguation message to return directly.
 */
export async function resolveTarget(
  params: ActionParams,
  cwd: string,
): Promise<ResolvedTarget | string> {
  if (!params.file && !params.symbol) {
    return "**Error:** Semantic actions require either anchored coordinates (`file`, `line`, `character`) or a `symbol` for discovery.";
  }

  if (params.file && params.line != null && params.character != null) {
    return resolveAnchored(params.file, params.line, params.character, cwd);
  }

  if (params.file && !params.symbol) {
    return "**Error:** Semantic actions with `file` require `line` and `character`, or provide `symbol` for discovery.";
  }

  if (params.symbol) {
    return resolveBySymbol(params, cwd);
  }

  return "**Error:** Could not resolve target.";
}

function resolveAnchored(
  file: string,
  line: number,
  character: number,
  cwd: string,
): ResolvedTarget | string {
  const result = resolveAnchoredTarget(file, line, character, cwd);
  if (result.kind === "error") return result.message;
  if (result.kind === "resolved") return result.target;
  return "**Error:** Unexpected disambiguation for anchored target.";
}

async function resolveBySymbol(
  params: ActionParams,
  cwd: string,
): Promise<ResolvedTarget | string> {
  const result = await resolveSymbolTarget(params.symbol ?? "", cwd, {
    path: params.path,
    kind: params.kind,
    exportedOnly: params.exportedOnly,
  });

  if (result.kind === "error") return result.message;
  if (result.kind === "resolved") return result.target;

  return formatDisambiguation(params, result);
}

function formatDisambiguation(
  params: ActionParams,
  result: {
    candidates: Array<{
      name: string;
      kind: string | null;
      container: string | null;
      file: string;
      line: number;
      character: number;
      rank: number;
    }>;
    omittedCount: number;
  },
): string {
  const lines: string[] = [];
  lines.push(`# Disambiguation needed for \`${params.symbol}\``);
  lines.push("");
  const omitNote = result.omittedCount > 0 ? ` (+${result.omittedCount} more)` : "";
  lines.push(
    `Found ${result.candidates.length} candidates${omitNote}. Rerun with anchored coordinates:`,
  );
  lines.push("");

  for (const c of result.candidates) {
    const kind = c.kind ? ` (${c.kind})` : "";
    const container = c.container ? ` in ${c.container}` : "";
    lines.push(
      `${c.rank}. **${c.name}**${kind}${container} — \`${c.file}\`:${c.line}:${c.character}`,
    );
  }

  lines.push("");
  if (result.candidates.length > 0) {
    const first = result.candidates[0];
    lines.push(
      `Example: \`{ "action": "${params.action}", "file": "${first.file}", "line": ${first.line}, "character": ${first.character} }\``,
    );
  }

  return lines.join("\n");
}
