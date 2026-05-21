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
import {
  type CodeIntelAction,
  formatCodeIntelActionList,
  isCodeIntelAction,
} from "./tool/action-specs.ts";
import type { CodeIntelResult } from "./types.ts";

export type { CodeIntelAction } from "./tool/action-specs.ts";

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
  /** Aggregate counts by directory instead of line-level matches (pattern action only). */
  summary?: boolean;
}

type ActionHandler = (
  params: ActionParams,
  cwd: string,
) => CodeIntelResult | Promise<CodeIntelResult>;

const ACTION_HANDLERS: Record<CodeIntelAction, ActionHandler> = {
  brief: executeBriefAction,
  callers: executeCallersAction,
  callees: executeCalleesAction,
  implementations: executeImplementationsAction,
  affected: executeAffectedAction,
  pattern: executePatternAction,
  index: (_params, cwd) => executeIndexAction(cwd),
};

/**
 * Main action dispatcher — validates params and routes to specific action handlers.
 * Returns structured content with optional metadata details per action type.
 */
export async function executeAction(
  params: ActionParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  const cwd = ctx.cwd;
  const error = validateParams(params, cwd);
  if (error) return { content: error, details: undefined };

  return ACTION_HANDLERS[params.action](params, cwd);
}

function validateParams(params: ActionParams, cwd: string): string | null {
  if (!params.action || !isCodeIntelAction(params.action)) {
    return `**Error:** Unknown action \`${params.action ?? "(none)"}\`. Supported: ${formatCodeIntelActionList({ fenced: true })}.`;
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

  if (
    params.action === "pattern" &&
    params.kind &&
    !new Set(["definition", "export", "import"]).has(params.kind)
  ) {
    return "**Error:** `pattern` action `kind` must be one of `definition`, `export`, or `import`.";
  }

  return null;
}
