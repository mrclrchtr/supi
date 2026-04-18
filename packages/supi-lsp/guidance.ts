import * as path from "node:path";
import type { OutstandingDiagnosticSummaryEntry } from "./manager-types.ts";
import type { ProjectServerInfo } from "./types.ts";

export const lspPromptSnippet =
  "Use semantic code intelligence for hover, definitions, references, symbols, rename planning, code actions, and diagnostics in supported languages.";

export const lspPromptGuidelines = [
  "Prefer the lsp tool over bash text search for supported source files when the task is semantic code navigation or diagnostics.",
  "Use lsp for hover, definitions, references, document symbols, rename planning, code actions, and diagnostics before falling back to grep-style shell search.",
  "Fall back to bash/read when LSP is unavailable, the file type is unsupported, or the task is plain-text search across docs, config files, or string literals.",
];

export function buildProjectGuidelines(servers: ProjectServerInfo[]): string[] {
  const dynamic = servers.map((server) => {
    const root = displayRoot(server.root);
    const fileTypes = server.fileTypes.map((entry) => `.${entry}`).join(", ");
    const actions = server.supportedActions.join(", ");
    const status = server.status === "running" ? "active" : "unavailable";
    const actionText = actions.length > 0 ? ` | actions: ${actions}` : "";
    return `LSP ${status}: ${server.name} | root: ${root} | files: ${fileTypes}${actionText}`;
  });

  return [...lspPromptGuidelines.slice(0, 2), ...dynamic, lspPromptGuidelines[2]].filter(Boolean);
}

export function formatDiagnosticsContext(
  diagnostics: OutstandingDiagnosticSummaryEntry[],
  maxFiles: number = 3,
): string | null {
  if (diagnostics.length === 0) return null;

  const lines = diagnostics
    .slice(0, maxFiles)
    .map((entry) => `- ${entry.file}: ${formatCounts(entry)}`);
  const remaining = diagnostics.length - Math.min(diagnostics.length, maxFiles);
  if (remaining > 0) {
    lines.push(`- +${remaining} more file${remaining === 1 ? "" : "s"}`);
  }

  return [
    '<extension-context source="supi-lsp">',
    "Outstanding diagnostics:",
    ...lines,
    "</extension-context>",
  ].join("\n");
}

export function diagnosticsContextFingerprint(content: string | null): string | null {
  return content;
}

type ContextMessageLike = {
  role?: string;
  customType?: string;
  details?: unknown;
};

export function reorderDiagnosticContextMessages<T extends ContextMessageLike>(
  messages: T[],
  activeToken: string | null,
): T[] {
  const filtered = messages.filter((message) => {
    if (message.customType !== "lsp-context") return true;
    if (!activeToken) return false;
    return getContextToken(message.details) === activeToken;
  });

  if (!activeToken) return filtered;

  const contextIndex = filtered.findIndex(
    (message) =>
      message.customType === "lsp-context" && getContextToken(message.details) === activeToken,
  );
  if (contextIndex === -1) return filtered;

  const userIndex = findLastUserMessageIndex(filtered);
  if (userIndex === -1 || contextIndex < userIndex) return filtered;

  const next = [...filtered];
  const [contextMessage] = next.splice(contextIndex, 1);
  if (!contextMessage) return filtered;
  next.splice(userIndex, 0, contextMessage);
  return next;
}

function formatCounts(entry: OutstandingDiagnosticSummaryEntry): string {
  const counts: string[] = [];
  if (entry.errors > 0) counts.push(pluralize(entry.errors, "error"));
  if (entry.warnings > 0) counts.push(pluralize(entry.warnings, "warning"));
  if (entry.information > 0) counts.push(pluralize(entry.information, "info"));
  if (entry.hints > 0) counts.push(pluralize(entry.hints, "hint"));
  return counts.join(", ");
}

function displayRoot(root: string): string {
  const relative = path.relative(process.cwd(), root);
  if (relative === "") return ".";
  if (relative.startsWith(`..${path.sep}`) || relative === "..") return root;
  return relative.replaceAll(path.sep, "/");
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function getContextToken(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const token = (details as { contextToken?: unknown }).contextToken;
  return typeof token === "string" ? token : null;
}

function findLastUserMessageIndex<T extends ContextMessageLike>(messages: T[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}
