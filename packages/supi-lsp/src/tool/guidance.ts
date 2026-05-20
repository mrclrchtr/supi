// Prompt guidance and tool description for the lsp tool.
// Dynamic guidelines are built per-project to reflect active LSP servers.
//
// Note: We intentionally do NOT include cross-tool routing (e.g., "use code_intel
// for architecture overviews") because this package can be installed standalone
// without supi-code-intelligence.

import * as path from "node:path";
import type { ProjectServerInfo } from "../config/types.ts";

export const toolDescription = `Language Server Protocol tool — semantic code intelligence for supported languages.

Actions: hover, definition, references, diagnostics, symbols, rename, code_actions, workspace_symbol, search, symbol_hover, recover.

Use lsp for type-driven navigation, definitions, references, diagnostics, workspace symbol search, renames, and code actions in files covered by an active server. Line and character are 1-based. File paths are relative to cwd.`;

export const promptSnippet =
  "lsp — semantic navigation, type information, diagnostics, references, renames, and code actions in supported files";

export const actionGuidelines = [
  "Use lsp.diagnostics(file?) to inspect current diagnostics for one file or the whole project when you need them on demand.",
  "Use lsp.hover(file, line, character) for type info, signatures, and documentation at a position.",
  "Use lsp.definition(file, line, character) to go to the definition of a symbol.",
  "Use lsp.references(file, line, character) to find all usages of a symbol.",
  "Use lsp.symbols(file) to list all top-level symbols in a single file.",
  "Use lsp.workspace_symbol(query) for pure LSP fuzzy symbol search across the project.",
  "Use lsp.search(query) when you need a symbol search that falls back to text search if lsp has no semantic results.",
  "Use lsp.rename(file, line, character, newName) or lsp.code_actions(file, line, character) for renames and available fixes.",
  "Use lsp.recover() to refresh cached diagnostics after workspace changes or suspicious stale results.",
];

export const fallbackGuideline =
  "Use lsp first for semantic questions in supported files. lsp diagnostics are also surfaced automatically after relevant edits, so call lsp when you need a specific lookup, explicit diagnostic snapshot, code action, rename, or recovery.";

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
      return `lsp active: ${server.name} | root: ${root} | files: ${fileTypes}${actionText}`;
    });

  const unavailable = servers
    .filter((server) => server.status !== "running")
    .map((server) => server.name);

  const dynamic: string[] = [...active];
  if (unavailable.length > 0) {
    dynamic.push(
      `lsp unavailable: ${unavailable.join(", ")} — install or enable those servers to extend lsp language coverage`,
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
