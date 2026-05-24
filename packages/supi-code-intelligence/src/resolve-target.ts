/**
 * Action-facing target resolution — routes normalized queries and
 * maps typed resolver outcomes to user-facing strings and legacy types.
 *
 * This is the thin orchestration layer between tool/action params and
 * the typed targeting pipeline. Formatting of disambiguation/error
 * outcomes happens here, at the action boundary.
 */

import type { CodeQueryParams as ActionParams } from "./query-params.ts";
import {
  type ResolvedTarget,
  type ResolvedTargetGroup,
  resolveAnchoredTarget,
  resolveFileTargetGroup,
  resolveSymbolTarget,
} from "./target-resolution.ts";
import { normalizeQuery } from "./targeting/query.ts";
import type { ResolverDeps, TargetOutcome } from "./targeting/types.ts";

/**
 * Resolve a target from action params.
 *
 * Returns either a {@link ResolvedTarget}, a {@link ResolvedTargetGroup},
 * or a user-facing error/disambiguation string.
 */
export async function resolveTarget(
  params: ActionParams,
  cwd: string,
  semantic?: import("./substrates/types.ts").SemanticSubstrate,
): Promise<ResolvedTarget | ResolvedTargetGroup | string> {
  const query = normalizeQuery(params);

  switch (query.kind) {
    case "anchored":
      return resolveAnchored(query.file, query.line, query.character, cwd);

    case "file":
      return resolveByFile(query.file, cwd);

    case "symbol": {
      if (!semantic) {
        return "**Error:** Symbol discovery requires active LSP. Use `file` + coordinates, or enable LSP and retry.";
      }
      const deps: ResolverDeps = { cwd, semantic };
      return resolveBySymbol(query.symbol, deps, {
        path: query.path,
        kind: query.symbolKind,
        exportedOnly: query.exportedOnly,
      });
    }

    case "invalid":
      return `**Error:** ${query.reason}`;
  }
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
  return "**Error:** Unexpected resolution outcome.";
}

async function resolveByFile(file: string, cwd: string): Promise<ResolvedTargetGroup | string> {
  const result = await resolveFileTargetGroup(file, cwd);
  if (result.kind === "error") return result.message;
  return result.group;
}

async function resolveBySymbol(
  symbol: string,
  deps: ResolverDeps,
  options?: { path?: string; kind?: string; exportedOnly?: boolean },
): Promise<ResolvedTarget | string> {
  const outcome: TargetOutcome = await resolveSymbolTarget(
    symbol,
    deps.cwd,
    // biome-ignore lint/style/noNonNullAssertion: semantic is always set for symbol queries
    deps.semantic!,
    options,
  );

  if (outcome.kind === "resolved") {
    return outcome.target as ResolvedTarget;
  }

  if (outcome.kind === "error") {
    return outcome.message;
  }

  return formatDisambiguation(symbol, outcome);
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
