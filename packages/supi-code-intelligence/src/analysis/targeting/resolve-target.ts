/**
 * Unified target resolution facade through src/targeting/*.
 *
 * This is the canonical resolution path. It handles anchored coordinates,
 * file-only, symbol discovery, and disambiguation cases through one path.
 */

import type { SemanticProvider } from "@mrclrchtr/supi-code-runtime/api";
import { normalizePath } from "../../search-helpers.ts";
import { resolveAnchoredTarget as resolveAnchored } from "../../targeting/resolve-anchored.ts";
import { resolveFileTargetGroup as resolveFile } from "../../targeting/resolve-file.ts";
import { resolveSymbolTarget as resolveSymbol } from "../../targeting/resolve-symbol.ts";
import type {
  ResolvedTargetData,
  ResolvedTargetGroupData,
  TargetOutcome,
} from "../../targeting/types.ts";
import { normalizeQuery, type QueryInput } from "./normalize-query.ts";

export type { QueryInput } from "./normalize-query.ts";

/**
 * Resolve a target from action params through one canonical path.
 *
 * Returns either a resolved target, a target group, or an error string.
 */
export async function resolveTarget(
  params: QueryInput,
  cwd: string,
  semantic?: SemanticProvider,
): Promise<ResolvedTargetData | ResolvedTargetGroupData | string> {
  const query = normalizeQuery(params);

  switch (query.kind) {
    case "anchored": {
      const resolvedFile = normalizePath(query.file, cwd);
      const result = resolveAnchored(resolvedFile, query.line, query.character);
      if (result.kind === "error") return result.message;
      if (result.kind === "resolved") return result.target;
      return "**Error:** Unexpected resolution outcome.";
    }

    case "file": {
      const result = await resolveFile(query.file, cwd);
      if (result.kind === "error") return result.message;
      return result.group;
    }

    case "symbol": {
      if (!semantic) {
        return "**Error:** Symbol discovery requires active LSP. Use `file` + coordinates, or enable LSP and retry.";
      }
      const outcome = await resolveSymbol(query.symbol, cwd, semantic, {
        path: query.path,
        kind: query.symbolKind,
        exportedOnly: query.exportedOnly,
      });
      if (outcome.kind === "resolved") return outcome.target;
      if (outcome.kind === "error") return outcome.message;
      if (outcome.kind !== "disambiguation") {
        return "**Error:** Unexpected resolution outcome.";
      }
      // Disambiguation — format candidates
      return formatDisambiguation(query.symbol, outcome);
    }

    case "invalid":
      return `**Error:** ${query.reason}`;
  }
}

function formatDisambiguation(
  symbol: string,
  result: Extract<TargetOutcome, { kind: "disambiguation" }>,
): string {
  const lines: string[] = [];
  lines.push(`# Disambiguation needed for \`${symbol}\``);
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
      `Example: rerun with \`file: "${first.file}"\`, \`line: ${first.line}\`, and \`character: ${first.character}\`.`,
    );
  }

  return lines.join("\n");
}
