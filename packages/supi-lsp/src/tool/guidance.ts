// Prompt guidance and tool description for the lsp tool.
// Dynamic guidelines are built per-project to reflect active LSP servers.
//
// Note: We intentionally do NOT include cross-tool routing (e.g., "use code_intel
// for architecture overviews") because this package can be installed standalone
// without supi-code-intelligence.

import * as path from "node:path";
import type { ProjectServerInfo } from "../config/types.ts";

const actionList =
  "hover, definition, references, diagnostics, symbols, rename, code_actions, workspace_symbol, search, symbol_hover, recover";

export const toolDescription = `Language Server Protocol tool — semantic code intelligence for supported languages.

Actions: ${actionList}.

Use lsp for semantic lookups in files covered by an active server: hover/type info, definitions, references, file symbols, diagnostics, rename, and code actions. Use lsp.search(query) for workspace symbol lookup with text-search fallback, lsp.symbol_hover(symbol) for hover by symbol name, and lsp.recover() when diagnostics look stale. Line and character are 1-based. File paths are relative to cwd.`;

export const promptSnippet =
  "lsp — semantic lookup, diagnostics, rename, and code actions in supported files";

export const actionGuidelines = [
  "Use lsp.diagnostics(file?) when you need current diagnostics for one file or the whole project.",
  "Use lsp.hover(file, line, character), lsp.definition(file, line, character), or lsp.references(file, line, character) when you know a file position and need semantic info there.",
  "Use lsp.symbols(file) when you need top-level declarations in one file.",
  "Use lsp.workspace_symbol(query) for semantic symbol-name lookup, lsp.search(query) for symbol lookup with text-search fallback, and lsp.symbol_hover(symbol) for hover from the first workspace match.",
  "Use lsp.rename(file, line, character, newName) for semantic renames at a known position.",
  "Use lsp.code_actions(file, line, character) for quick fixes or refactor suggestions at a specific position.",
  "Use lsp.recover() when diagnostics look stale after workspace-level changes.",
];

export const fallbackGuideline =
  "Use lsp first for semantic questions in supported files. lsp diagnostics also appear automatically after relevant edits, so call lsp when you need an explicit lookup, diagnostics snapshot, rename, code action, or recovery.";

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
      const fileTypes = server.fileTypes.map((entry) => `.${entry}`).join(",");
      const actions = server.supportedActions.join(",");
      const actionText = actions.length > 0 ? ` | actions: ${actions}` : "";
      return `lsp active: ${server.name} | root: ${root} | files: ${fileTypes}${actionText}`;
    });

  const unavailable = servers
    .filter((server) => server.status !== "running")
    .map((server) => server.name);

  const dynamic: string[] = [...active];
  if (unavailable.length > 0) {
    dynamic.push(
      `lsp unavailable: ${unavailable.join(",")} — install or enable to extend coverage`,
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
