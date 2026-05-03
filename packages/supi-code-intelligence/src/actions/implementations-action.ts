// Implementations action — find concrete implementations via LSP or heuristic.

import * as path from "node:path";
import { getSessionLspService } from "@mrclrchtr/supi-lsp";
import { resolveTarget } from "../resolve-target.ts";
import { escapeRegex, normalizePath, runRipgrep } from "../search-helpers.ts";
import type { ActionParams } from "../tool-actions.ts";

export async function executeImplementationsAction(
  params: ActionParams,
  cwd: string,
): Promise<string> {
  const target = await resolveTarget(params, cwd);
  if (typeof target === "string") return target;

  const lspState = getSessionLspService(cwd);
  const relPath = path.relative(cwd, target.file);

  if (lspState.kind === "ready") {
    const impls = await lspState.service.implementation(target.file, target.position);
    if (impls) {
      const locations = Array.isArray(impls) ? impls : [impls];
      if (locations.length > 0) {
        return formatSemanticImpls(locations, cwd, params.maxResults ?? 8);
      }
    }
  }

  if (target.name) {
    return formatHeuristicImpls(target.name, params, cwd);
  }

  return `No implementations found for ${relPath}:${target.displayLine}:${target.displayCharacter}.\n\nLSP implementation lookup may not be available. Try \`code_intel pattern\` with the type name.`;
}

function formatSemanticImpls(
  locations: Array<{
    uri?: string;
    targetUri?: string;
    range?: { start: { line: number } };
    targetRange?: { start: { line: number } };
  }>,
  cwd: string,
  maxResults: number,
): string {
  const lines: string[] = [];
  lines.push("# Implementations (semantic)");
  lines.push("");
  lines.push(`**${locations.length} implementation${locations.length > 1 ? "s" : ""}**`);
  lines.push("");

  let shown = 0;
  for (const loc of locations) {
    if (shown >= maxResults) break;
    const uri = loc.uri ?? loc.targetUri ?? "";
    const range = loc.range ?? loc.targetRange ?? null;
    const filePath = uri.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : uri;
    const implRelPath = path.relative(cwd, filePath);
    const line = range ? range.start.line + 1 : 0;
    lines.push(`- \`${implRelPath}\`:${line}`);
    shown++;
  }

  if (locations.length > maxResults) {
    lines.push(`- _+${locations.length - maxResults} more omitted_`);
  }
  lines.push("");
  return lines.join("\n");
}

function formatHeuristicImpls(symbol: string, params: ActionParams, cwd: string): string {
  const scopePath = params.path ? normalizePath(params.path, cwd) : cwd;
  const pattern = `(implements|extends)\\s+.*\\b${escapeRegex(symbol)}\\b`;
  const matches = runRipgrep(pattern, scopePath, cwd, { maxMatches: 10 });

  if (matches.length === 0) {
    return `No implementations found for \`${symbol}\`.\n\nTry \`code_intel pattern\` with the type name.`;
  }

  const lines: string[] = [];
  lines.push(`# Implementations of \`${symbol}\` (heuristic)`);
  lines.push("");
  lines.push(
    `**${matches.length} candidate${matches.length > 1 ? "s" : ""}** — text-search hints, not semantic implementations`,
  );
  lines.push("");

  for (const m of matches.slice(0, 8)) {
    lines.push(`- \`${m.file}\`:${m.line} — \`${m.text.slice(0, 80)}\``);
  }
  if (matches.length > 8) {
    lines.push(`- _+${matches.length - 8} more omitted_`);
  }
  lines.push("");
  return lines.join("\n");
}
