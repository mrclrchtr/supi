// Tool action router — dispatches code_intel actions to specific implementations.

import * as fs from "node:fs";
import { executeAffectedAction } from "./actions/affected-action.ts";
import { executeBriefAction } from "./actions/brief-action.ts";
import { executeCalleesAction } from "./actions/callees-action.ts";
import { executeCallersAction } from "./actions/callers-action.ts";
import { executeImplementationsAction } from "./actions/implementations-action.ts";
import { executeIndexAction } from "./actions/index-action.ts";
import { executePatternAction } from "./actions/pattern-action.ts";
import { normalizePath } from "./search-helpers.ts";

export type CodeIntelAction =
  | "brief"
  | "callers"
  | "callees"
  | "implementations"
  | "affected"
  | "pattern"
  | "index";

/** Flat parameter bag shared by `code_intel` action handlers. */
export interface ActionParams {
  action: CodeIntelAction;
  path?: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  /** Text search input for `action: "pattern"`; treated as literal unless `regex` is true. */
  pattern?: string;
  /** Opt into raw ripgrep regex semantics for `action: "pattern"`. */
  regex?: boolean;
  kind?: string;
  exportedOnly?: boolean;
  maxResults?: number;
  contextLines?: number;
  summary?: boolean;
}

const SUPPORTED_ACTIONS = new Set<string>([
  "brief",
  "callers",
  "callees",
  "implementations",
  "affected",
  "pattern",
  "index",
]);

/**
 * Main action dispatcher — validates params and routes to specific action handlers.
 */
export async function executeAction(params: ActionParams, ctx: { cwd: string }): Promise<string> {
  const cwd = ctx.cwd;
  const error = validateParams(params, cwd);
  if (error) return error;

  switch (params.action) {
    case "brief":
      return executeBriefAction(params, cwd);
    case "callers":
      return executeCallersAction(params, cwd);
    case "callees":
      return executeCalleesAction(params, cwd);
    case "implementations":
      return executeImplementationsAction(params, cwd);
    case "affected":
      return executeAffectedAction(params, cwd);
    case "pattern":
      return executePatternAction(params, cwd);
    case "index":
      return executeIndexAction(cwd);
    default:
      return `**Error:** Unknown action \`${params.action}\`.`;
  }
}

function validateParams(params: ActionParams, cwd: string): string | null {
  if (!params.action || !SUPPORTED_ACTIONS.has(params.action)) {
    return `**Error:** Unknown action \`${params.action ?? "(none)"}\`. Supported: \`brief\`, \`callers\`, \`callees\`, \`implementations\`, \`affected\`, \`pattern\`, \`index\`.`;
  }

  if (params.path && (params.line != null || params.character != null)) {
    return "**Error:** `line` and `character` require `file`, not `path`. Use `path` to scope/focus; use `file` to anchor a position.";
  }

  if (params.file) {
    const resolvedFile = normalizePath(params.file, cwd);
    if (fs.existsSync(resolvedFile) && fs.statSync(resolvedFile).isDirectory()) {
      return "**Error:** `file` points to a directory. Use `path` to scope a directory; use `file` to anchor a position in a file.";
    }
  }

  if ((params.line != null || params.character != null) && !params.file) {
    return "**Error:** `line` and `character` require `file`.";
  }

  return null;
}
