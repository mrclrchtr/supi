// Prompt guidance and tool descriptions for the expert LSP toolset.

import * as path from "node:path";
import type { ProjectServerInfo } from "../config/types.ts";
import {
  LSP_DIAGNOSTICS_TOOL,
  LSP_DOCUMENT_SYMBOLS_TOOL,
  LSP_LOOKUP_TOOL,
  LSP_RECOVER_TOOL,
  LSP_REFACTOR_TOOL,
  LSP_WORKSPACE_SYMBOLS_TOOL,
  type LspToolName,
} from "./names.ts";

export interface LspToolPromptSurface {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

export type LspToolPromptSurfaceMap = Record<LspToolName, LspToolPromptSurface>;

const LOOKUP_GUIDELINES = [
  'Use lsp_lookup with `kind: "hover"` for semantic type or symbol information at a known `file`, `line`, and `character`.',
  'Use lsp_lookup with `kind: "definition"`, `"references"`, or `"implementation"` for semantic navigation at a known position.',
  "Use lsp_lookup after code_intel or tree_sitter has already narrowed the target file and position.",
];

const DOCUMENT_SYMBOL_GUIDELINES = [
  "Use lsp_document_symbols(file) for semantic declarations in one supported file.",
];

const WORKSPACE_SYMBOL_GUIDELINES = [
  "Use lsp_workspace_symbols(query) for semantic symbol-name lookup across the current project.",
];

const DIAGNOSTICS_GUIDELINES = [
  "Use lsp_diagnostics(file?) when you need current diagnostics for one file or a workspace-level summary.",
];

const REFACTOR_GUIDELINES = [
  'Use lsp_refactor with `kind: "rename"` for semantic rename planning at a known `file`, `line`, and `character`.',
  'Use lsp_refactor with `kind: "code_actions"` for semantic fixes or refactors at a known position.',
];

const RECOVER_GUIDELINES = [
  "Use lsp_recover() when diagnostics look stale after workspace-level changes or generated-file updates.",
];

export const defaultLspToolPromptSurfaces = buildLspToolPromptSurfaces([], ".");

export function buildLspToolPromptSurfaces(
  servers: ProjectServerInfo[],
  cwd: string,
): LspToolPromptSurfaceMap {
  const coverageGuidelines = buildCoverageGuidelines(servers, cwd);

  return {
    [LSP_LOOKUP_TOOL]: {
      description:
        "Language Server Protocol lookup tool — semantic hover, definition, references, and implementation for supported files. Use lsp_lookup when you know the file and 1-based line/character position and need semantic drill-down rather than text search.",
      promptSnippet:
        "lsp_lookup — semantic hover/definition/references/implementation at a known file position",
      promptGuidelines: [...LOOKUP_GUIDELINES, ...coverageGuidelines],
    },
    [LSP_DOCUMENT_SYMBOLS_TOOL]: {
      description:
        "Language Server Protocol document symbols tool — list semantic declarations in one supported file. Use lsp_document_symbols when you need a symbol-aware outline rather than raw text structure.",
      promptSnippet: "lsp_document_symbols — semantic declarations for one supported file",
      promptGuidelines: DOCUMENT_SYMBOL_GUIDELINES,
    },
    [LSP_WORKSPACE_SYMBOLS_TOOL]: {
      description:
        "Language Server Protocol workspace symbols tool — semantic symbol-name lookup across the current project. Use lsp_workspace_symbols to find declarations by name before opening a specific file.",
      promptSnippet: "lsp_workspace_symbols — semantic symbol-name lookup across the project",
      promptGuidelines: WORKSPACE_SYMBOL_GUIDELINES,
    },
    [LSP_DIAGNOSTICS_TOOL]: {
      description:
        "Language Server Protocol diagnostics tool — current diagnostics for one file or a workspace summary. Use lsp_diagnostics for semantic compiler or language-server issues instead of guessing from text alone.",
      promptSnippet: "lsp_diagnostics — current diagnostics for one file or the workspace",
      promptGuidelines: DIAGNOSTICS_GUIDELINES,
    },
    [LSP_REFACTOR_TOOL]: {
      description:
        "Language Server Protocol refactor tool — semantic rename planning and code actions at a known file position. Use lsp_refactor when you need language-server-backed edits or quick-fix suggestions.",
      promptSnippet: "lsp_refactor — semantic rename planning and code actions at a known position",
      promptGuidelines: REFACTOR_GUIDELINES,
    },
    [LSP_RECOVER_TOOL]: {
      description:
        "Language Server Protocol recover tool — refresh diagnostics after workspace changes and stale language-server state. Use lsp_recover when new files, generated types, or config updates leave diagnostics out of sync.",
      promptSnippet: "lsp_recover — refresh stale diagnostics after workspace changes",
      promptGuidelines: RECOVER_GUIDELINES,
    },
  };
}

function buildCoverageGuidelines(servers: ProjectServerInfo[], cwd: string): string[] {
  const active = servers
    .filter((server) => server.status === "running")
    .map((server) => {
      const root = displayRoot(server.root, cwd);
      const fileTypes = server.fileTypes.map((entry) => `.${entry}`).join(",");
      const actions = server.supportedActions.join(",");
      const actionText = actions.length > 0 ? ` | actions: ${actions}` : "";
      return `lsp server coverage: ${server.name} | root: ${root} | files: ${fileTypes}${actionText}`;
    });

  const unavailable = servers
    .filter((server) => server.status !== "running")
    .map((server) => server.name);

  const dynamic = [...active];
  if (unavailable.length > 0) {
    dynamic.push(
      `lsp server unavailable: ${unavailable.join(",")} — install or enable to extend semantic coverage`,
    );
  }

  return dynamic;
}

function displayRoot(root: string, cwd: string): string {
  const relative = path.relative(cwd, root);
  if (relative === "") return ".";
  if (relative.startsWith(`..${path.sep}`) || relative === "..") return root;
  return relative.replaceAll(path.sep, "/");
}

// Compatibility exports for older internal tests and helper imports.
export const toolDescription = defaultLspToolPromptSurfaces[LSP_LOOKUP_TOOL].description;
export const promptSnippet = defaultLspToolPromptSurfaces[LSP_LOOKUP_TOOL].promptSnippet;
export const promptGuidelines = defaultLspToolPromptSurfaces[LSP_LOOKUP_TOOL].promptGuidelines;

export function buildProjectGuidelines(servers: ProjectServerInfo[], cwd: string): string[] {
  return buildLspToolPromptSurfaces(servers, cwd)[LSP_LOOKUP_TOOL].promptGuidelines;
}
