// Prompt guidance and tool description for the lsp tool.
// Dynamic guidelines are built per-project to reflect active LSP servers.
//
// Note: We intentionally do NOT include cross-tool routing (e.g., "use code_intel
// for architecture overviews") because this package can be installed standalone
// without supi-code-intelligence.

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

export const actionGuidelines = [
  "Use lsp.hover(file, line, character) for type info, signatures, and documentation at a position.",
  "Use lsp.definition(file, line, character) to go to the definition of a symbol.",
  "Use lsp.references(file, line, character) to find all usages of a symbol.",
  "Use lsp.symbols(file) to list all top-level symbols in a single file.",
  "Use lsp.workspace_symbol(query) for pure LSP fuzzy symbol search across the project.",
  "Use lsp.search(query) when you need a symbol search that falls back to text search if LSP has no results.",
  "Use lsp.rename(file, line, character, newName) or lsp.code_actions(file, line, character) for renames and available fixes.",
  "Use lsp.recover() to refresh cached diagnostics after workspace changes.",
];

export const fallbackGuideline =
  "Use lsp first for semantic questions in supported files. Diagnostics are already delivered automatically; call lsp when you need a specific lookup, code action, or recovery.";

export const promptGuidelines = [...actionGuidelines, fallbackGuideline];

/**
 * Build per-project `promptGuidelines` for the `lsp` tool registration.
 * These guidelines are part of pi's stable system prompt after session-start
 * tool registration, avoiding per-turn `before_agent_start` prompt overrides.
 */
export function buildProjectGuidelines(servers: ProjectServerInfo[], cwd: string): string[] {
  const active = servers
    .filter((server) => server.status === "running")
    .map((server) => {
      const root = displayRoot(server.root, cwd);
      const fileTypes = server.fileTypes.map((entry) => `.${entry}`).join(", ");
      const actions = server.supportedActions.join(", ");
      const actionText = actions.length > 0 ? ` | actions: ${actions}` : "";
      return `LSP active: ${server.name} | root: ${root} | files: ${fileTypes}${actionText}`;
    });

  const unavailable = servers
    .filter((server) => server.status !== "running")
    .map((server) => server.name);

  const dynamic: string[] = [...active];
  if (unavailable.length > 0) {
    dynamic.push(
      `LSP unavailable: ${unavailable.join(", ")} — install servers to enable language intelligence`,
    );
  }

  return [...actionGuidelines, ...dynamic, fallbackGuideline].filter(Boolean);
}

function displayRoot(root: string, cwd: string): string {
  const relative = path.relative(cwd, root);
  if (relative === "") return ".";
  if (relative.startsWith(`..${path.sep}`) || relative === "..") return root;
  return relative.replaceAll(path.sep, "/");
}
