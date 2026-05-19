// Prompt guidance and tool description for the lsp tool.
// Dynamic guidelines are built per-project to reflect active LSP servers.

import * as path from "node:path";
import type { ProjectServerInfo } from "./types.ts";

export const toolDescription = `Language Server Protocol tool — provides type-aware code intelligence.

Call shape: { action, args } where args is action-specific.

Actions:
- hover: Get type info and docs at a position. Args: { file, line, character }
- definition: Go to definition of a symbol. Args: { file, line, character }
- references: Find all references to a symbol. Args: { file, line, character }
- diagnostics: Get type errors and warnings. Args: { file } (optional — omit args or file for all files)
- symbols: List all symbols in a file. Args: { file }
- rename: Rename a symbol across the project. Args: { file, line, character, newName }
- code_actions: Get available fixes/refactors at a position. Args: { file, line, character }
- workspace_symbol: Fuzzy symbol search across the project. Args: { query }
- search: Search for symbols (LSP first, then text fallback). Args: { query }
- symbol_hover: Hover info by symbol name (zero coordinates). Args: { symbol }
- recover: Refresh cached diagnostics after a workspace change. Args: none

Line and character are 1-based. File paths are relative to cwd.`;

export const promptSnippet =
  "Use `lsp` for semantic navigation, type information, references, renames, and code actions in supported languages.";

export const promptGuidelines = [
  `Use lsp with { action, args }.
  if you need type/signature/docs → hover(file, line, character)
  if you need definition of a symbol → definition(file, line, character)
  if you need references/usages of a symbol → references(file, line, character)
  if you need top-level symbols in one file → symbols(file)
  if you need to find a symbol by name → workspace_symbol(query) or search(query)
  if you need a rename or available fix → rename(...) or code_actions(...)
  if diagnostics look stale after config/import/type changes → recover()`,
  "Use lsp first for semantic questions in supported files. Diagnostics are already delivered automatically; call lsp when you need a specific lookup, code action, or recovery.",
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

  return [promptGuidelines[0], ...dynamic, promptGuidelines[1]].filter(Boolean);
}

function displayRoot(root: string, cwd: string): string {
  const relative = path.relative(cwd, root);
  if (relative === "") return ".";
  if (relative.startsWith(`..${path.sep}`) || relative === "..") return root;
  return relative.replaceAll(path.sep, "/");
}
