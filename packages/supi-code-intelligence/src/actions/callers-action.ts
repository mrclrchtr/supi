// Callers action — find call sites for a symbol.

import * as path from "node:path";
import { getSessionLspService } from "@mrclrchtr/supi-lsp";
import { resolveTarget } from "../resolve-target.ts";
import {
  escapeRegex,
  groupByFile,
  isInProjectPath,
  normalizePath,
  runRipgrep,
  uriToFile,
} from "../search-helpers.ts";
import type { ActionParams } from "../tool-actions.ts";

export async function executeCallersAction(params: ActionParams, cwd: string): Promise<string> {
  const target = await resolveTarget(params, cwd);
  if (typeof target === "string") return target;

  const maxResults = params.maxResults ?? 5;
  const lspState = getSessionLspService(cwd);

  if (lspState.kind === "ready") {
    const refs = await lspState.service.references(target.file, target.position);
    if (refs && refs.length > 0) {
      // Filter out the declaration itself — LSP includes it with includeDeclaration
      const callerRefs = filterOutDeclaration(refs, target.file, target.position);
      if (callerRefs.length > 0) {
        return formatSemanticCallers(callerRefs, target.name, cwd, maxResults);
      }
    }
  }

  if (target.name) {
    return formatHeuristicCallers(target.name, params, cwd);
  }

  const relPath = path.relative(cwd, target.file);
  return `No caller data available for ${relPath}:${target.displayLine}:${target.displayCharacter}. LSP may not be active.\n\nTry \`code_intel pattern\` with the symbol name for text-search matches.`;
}

function partitionRefs(
  refs: Array<{ uri: string; range: { start: { line: number; character: number } } }>,
  cwd: string,
): { project: typeof refs; external: typeof refs } {
  const project: typeof refs = [];
  const external: typeof refs = [];
  for (const ref of refs) {
    if (isInProjectPath(uriToFile(ref.uri), cwd)) {
      project.push(ref);
    } else {
      external.push(ref);
    }
  }
  return { project, external };
}

function groupRefsByFile(
  refs: Array<{ uri: string; range: { start: { line: number; character: number } } }>,
  cwd: string,
): Map<string, number[]> {
  const byFile = new Map<string, number[]>();
  for (const ref of refs) {
    const filePath = uriToFile(ref.uri);
    const relPath = path.relative(cwd, filePath);
    const group = byFile.get(relPath) ?? [];
    group.push(ref.range.start.line + 1);
    byFile.set(relPath, group);
  }
  return byFile;
}

function formatSemanticCallers(
  refs: Array<{ uri: string; range: { start: { line: number; character: number } } }>,
  name: string | null,
  cwd: string,
  maxResults: number,
): string {
  const { project: projectRefs, external: externalRefs } = partitionRefs(refs, cwd);

  const lines: string[] = [];
  lines.push(`# Callers of \`${name ?? "symbol"}\``);
  lines.push("");
  lines.push(
    `**${projectRefs.length} reference${projectRefs.length !== 1 ? "s" : ""}** (semantic)`,
  );
  if (externalRefs.length > 0) {
    const suffix =
      externalRefs.length === 1
        ? "+1 external reference"
        : `+${externalRefs.length} external references`;
    lines.push(`_${suffix} (node_modules, .pnpm, or out-of-tree)_`);
  }
  lines.push("");

  const byFile = groupRefsByFile(projectRefs, cwd);

  let shown = 0;
  for (const [file, locations] of byFile) {
    if (shown >= maxResults) break;
    lines.push(`### ${file}`);
    for (const loc of locations.slice(0, 5)) {
      lines.push(`- L${loc}`);
    }
    if (locations.length > 5) {
      lines.push(`- _+${locations.length - 5} more in this file_`);
    }
    lines.push("");
    shown++;
  }

  if (byFile.size > maxResults) {
    lines.push(
      `_+${byFile.size - maxResults} more files omitted. Narrow with \`path\` or increase \`maxResults\`._`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

function formatHeuristicCallers(symbol: string, params: ActionParams, cwd: string): string {
  const maxResults = params.maxResults ?? 8;
  const scopePath = params.path ? normalizePath(params.path, cwd) : cwd;
  const pattern = `\\b${escapeRegex(symbol)}\\b`;
  const matches = runRipgrep(pattern, scopePath, cwd, { maxMatches: maxResults * 3 });

  if (matches.length === 0) {
    return `No references found for \`${symbol}\` (heuristic).`;
  }

  const lines: string[] = [];
  lines.push(`# Callers of \`${symbol}\` (heuristic)`);
  lines.push("");
  lines.push(
    `**${matches.length} match${matches.length > 1 ? "es" : ""}** — text-search hints, not semantic references`,
  );
  lines.push("");

  const byFile = groupByFile(matches);
  let shown = 0;
  for (const [file, fileMatches] of byFile) {
    if (shown >= maxResults) break;
    lines.push(`### ${file}`);
    for (const m of fileMatches.slice(0, 3)) {
      lines.push(`- L${m.line}: \`${m.text.slice(0, 100)}\``);
    }
    if (fileMatches.length > 3) {
      lines.push(`- _+${fileMatches.length - 3} more_`);
    }
    lines.push("");
    shown++;
  }

  if (byFile.size > maxResults) {
    lines.push(`_+${byFile.size - maxResults} more files omitted._`);
  }

  return lines.join("\n");
}

type LspRef = { uri: string; range: { start: { line: number; character: number } } };
type LspPos = { line: number; character: number };

/**
 * Filter out the declaration/definition location from LSP references.
 * LSP's `textDocument/references` includes the declaration by default;
 * for a callers query, the declaration is not a call site.
 */
function filterOutDeclaration(refs: LspRef[], targetFile: string, targetPos: LspPos): LspRef[] {
  return refs.filter((ref) => {
    const uri = ref.uri;
    const filePath = uri.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : uri;
    if (filePath !== targetFile) return true;
    const start = ref.range.start;
    return start.line !== targetPos.line || start.character !== targetPos.character;
  });
}
