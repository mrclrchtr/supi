import * as path from "node:path";
import { splitSuppressionDiagnostics } from "./diagnostics/suppression-diagnostics.ts";
import type { OutstandingDiagnosticSummaryEntry } from "./manager/manager-types.ts";
import type { Diagnostic, ProjectServerInfo } from "./types.ts";

export const lspPromptSnippet =
  "Use semantic code intelligence for hover, definitions, references, symbols, rename planning, code actions, and diagnostics in supported languages.";

export const lspPromptGuidelines = [
  "Prefer the lsp tool over bash text search for supported source files when the task is semantic code navigation or diagnostics.",
  "Use lsp for hover, definitions, references, document symbols, rename planning, code actions, and diagnostics before falling back to grep-style shell search.",
  "Fall back to bash/read when LSP is unavailable, the file type is unsupported, or the task is plain-text search across docs, config files, or string literals.",
  "Diagnostics are automatically delivered: inline after every write/edit tool result, and as context before each agent turn. You do not need to call the lsp tool to check them — they are already in your context.",
  "When delivered diagnostics show errors, decide: (a) expected temporary state from a planned multi-step change — continue your sequence, then verify at the end; (b) unexpected 'Cannot find module', unresolved imports, or type mismatches — stop and fix the root cause before editing more files.",
  "When the SAME error pattern appears across MULTIPLE files after you changed imports, dependencies, or shared types, it is a systemic root-cause issue (missing install, broken import path, wrong dependency version). Do not patch each file individually — find and fix the root cause first.",
  "After changing package.json dependencies, imports, or peer dependencies, run the package manager install command (e.g., pnpm install) before concluding that module resolution errors are real code bugs.",
];

/**
 * Build per-project `promptGuidelines` for the `lsp` tool registration.
 * These guidelines are part of pi's stable system prompt after session-start
 * tool registration, avoiding per-turn `before_agent_start` prompt overrides.
 */
export function buildProjectGuidelines(servers: ProjectServerInfo[], cwd: string): string[] {
  const dynamic = servers.map((server) => {
    const root = displayRoot(server.root, cwd);
    const fileTypes = server.fileTypes.map((entry) => `.${entry}`).join(", ");
    const actions = server.supportedActions.join(", ");
    const status = server.status === "running" ? "active" : "unavailable";
    const actionText = actions.length > 0 ? ` | actions: ${actions}` : "";
    return `LSP ${status}: ${server.name} | root: ${root} | files: ${fileTypes}${actionText}`;
  });

  return [
    ...lspPromptGuidelines.slice(0, 2),
    "Use lsp before grep/rg/find for understanding code, finding usages, diagnostics, symbol lookup, and refactors in supported languages.",
    ...dynamic,
    "Use lsp actions by task: hover/definition/references/symbols for understanding code, references/workspace_symbol/search for usages, diagnostics/hover/code_actions for issues, and rename/code_actions for refactors.",
    ...lspPromptGuidelines.slice(2),
  ].filter(Boolean);
}

export const MAX_DETAILED_DIAGNOSTICS = 5;
const MAX_DETAIL_LINES_PER_FILE = 3;

interface DetailedDiagnostics {
  file: string;
  diagnostics: Diagnostic[];
}

export function formatDiagnosticsContext(
  diagnostics: OutstandingDiagnosticSummaryEntry[],
  maxFiles: number = 3,
  detailed?: DetailedDiagnostics[],
): string | null {
  if (diagnostics.length === 0) return null;

  const totalDiags = diagnostics.reduce((sum, d) => sum + d.total, 0);
  const detailMap = buildDetailMap(diagnostics, totalDiags, detailed);

  const lines: string[] = [];
  const visible = diagnostics.slice(0, maxFiles);

  for (const entry of visible) {
    lines.push(`- ${entry.file}: ${formatCounts(entry)}`);
    appendDetailLines(lines, detailMap?.get(entry.file));
  }

  const remaining = diagnostics.length - visible.length;
  if (remaining > 0) {
    lines.push(`- +${remaining} more file${remaining === 1 ? "" : "s"}`);
  }

  appendSuppressionCleanup(
    lines,
    visible.map((entry) => entry.file),
    detailMap,
  );

  return [
    '<extension-context source="supi-lsp">',
    "Outstanding diagnostics — fix these before proceeding:",
    ...lines,
    "</extension-context>",
  ].join("\n");
}

function buildDetailMap(
  _diagnostics: OutstandingDiagnosticSummaryEntry[],
  totalDiags: number,
  detailed?: DetailedDiagnostics[],
): Map<string, Diagnostic[]> | null {
  if (totalDiags > MAX_DETAILED_DIAGNOSTICS || !detailed || detailed.length === 0) return null;
  return new Map(detailed.map((d) => [d.file, d.diagnostics]));
}

function appendDetailLines(lines: string[], details?: Diagnostic[]): void {
  if (!details) return;
  for (const d of details.slice(0, MAX_DETAIL_LINES_PER_FILE)) {
    const line = d.range.start.line + 1;
    const char = d.range.start.character + 1;
    const source = d.source ? ` ${d.source}` : "";
    lines.push(`  L${line} C${char}${source}: ${d.message}`);
  }
  if (details.length > MAX_DETAIL_LINES_PER_FILE) {
    const extra = details.length - MAX_DETAIL_LINES_PER_FILE;
    lines.push(`  +${extra} more`);
  }
}

function appendSuppressionCleanup(
  lines: string[],
  visibleFiles: string[],
  detailMap: Map<string, Diagnostic[]> | null,
): void {
  if (!detailMap) return;

  const suppressionLines: string[] = [];
  for (const file of visibleFiles) {
    const diagnostics = detailMap.get(file);
    if (!diagnostics) continue;

    const { suppressions } = splitSuppressionDiagnostics(diagnostics, 1);
    if (suppressions.length === 0) continue;

    suppressionLines.push(`- ${file}`);
    appendDetailLines(suppressionLines, suppressions);
  }

  if (suppressionLines.length === 0) return;
  lines.push("", "Stale suppression comments — clean these up:", ...suppressionLines);
}

export function diagnosticsContextFingerprint(content: string | null): string | null {
  return content;
}

// reorderDiagnosticContextMessages, getContextToken, and findLastUserMessageIndex
// have been extracted to supi-core/context-messages.ts.
// Use pruneAndReorderContextMessages(messages, "lsp-context", activeToken) instead.

function formatCounts(entry: OutstandingDiagnosticSummaryEntry): string {
  const counts: string[] = [];
  if (entry.errors > 0) counts.push(pluralize(entry.errors, "error"));
  if (entry.warnings > 0) counts.push(pluralize(entry.warnings, "warning"));
  if (entry.information > 0) counts.push(pluralize(entry.information, "info"));
  if (entry.hints > 0) counts.push(pluralize(entry.hints, "hint"));
  return counts.join(", ");
}

function displayRoot(root: string, cwd: string): string {
  const relative = path.relative(cwd, root);
  if (relative === "") return ".";
  if (relative.startsWith(`..${path.sep}`) || relative === "..") return root;
  return relative.replaceAll(path.sep, "/");
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
