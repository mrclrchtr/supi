/** Code- and source-action refactor planning for one named file. */

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import type { RefactorRequest, SourceRange } from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";
import { toLspPosition } from "@mrclrchtr/supi-lsp/api";
import { normalizePath } from "../analysis/search/paths.ts";
import {
  ensureFileReadiness,
  finishProviderPlan,
  planWithProvider,
  type RefactorWorkflowDeps,
} from "./refactor-plan-pipeline.ts";
import type {
  PublicSourceRange,
  RefactorOperationInput,
  RefactorPlanWorkflowOutcome,
} from "./refactor-types.ts";
import { reportProgress, throwIfAborted, type WorkflowControl } from "./workflow-control.ts";

/**
 * Plan one code or source action. These operations name a file directly and
 * never resolve a symbol target; source actions cover the whole document.
 */
export async function planFileAction(
  operation: Exclude<RefactorOperationInput, { rename_symbol: unknown }>,
  deps: RefactorWorkflowDeps,
  control?: WorkflowControl,
): Promise<RefactorPlanWorkflowOutcome> {
  const { name, selection, range } =
    "code_action" in operation
      ? {
          name: "code_action" as const,
          selection: operation.code_action,
          range: operation.code_action.range,
        }
      : { name: "source_action" as const, selection: operation.source_action, range: undefined };
  const file = normalizePath(selection.file, deps.cwd);
  const fileError = validateActionFile(file, selection.file, `operation.${name}.file`, deps.cwd);
  if (fileError) return { kind: "invalid-input", message: fileError };
  const rangeError = range
    ? validateRangeWithinFile(file, selection.file, range, `operation.${name}.range`)
    : null;
  if (rangeError) return { kind: "invalid-input", message: rangeError };

  const readiness = await ensureFileReadiness(file, deps, control);
  if (readiness) return readiness;
  reportProgress(control, {
    intent: "refactor-plan",
    phase: "provider",
    message: `Requesting ${selection.kind} code actions`,
  });
  const action = {
    file,
    kind: selection.kind,
    ...(selection.title === undefined ? {} : { title: selection.title }),
  };
  const request: RefactorRequest = range
    ? { operation: "code_action", ...action, range: toLspRange(range) }
    : { operation: "source_action", ...action };
  const result = await planWithProvider(
    deps.capability.getSemanticProvider(deps.cwd),
    request,
    control,
  );
  throwIfAborted(control);
  return finishProviderPlan(result, deps, {
    operation: name,
    file,
    discriminator: `${selection.kind}:${selection.title ?? ""}:${JSON.stringify(range ?? null)}`,
    fields: range ? { range } : {},
    evidenceSource: "semantic",
  });
}

/**
 * Check that an action file exists, is a file, and resolves inside the
 * workspace. Real paths are compared so a workspace link cannot reach an
 * outside file; apply still enforces the server's own mutation roots.
 */
function validateActionFile(
  file: string,
  input: string,
  label: string,
  cwd: string,
): string | null {
  if (!existsSync(file)) return `File not found: \`${input}\``;
  if (statSync(file).isDirectory()) {
    return `${label} must be a file, not a directory: \`${input}\`.`;
  }
  if (!isWithinOrEqual(realpathSync(cwd), realpathSync(file))) {
    return `${label} must be inside the workspace: \`${input}\`.`;
  }
  return null;
}

/**
 * Check that both range ends lie inside the file's current disk text, so an
 * out-of-range position fails as input instead of as a server error. Positions
 * are one-based UTF-16; a line's maximum character is one past its last character.
 */
function validateRangeWithinFile(
  file: string,
  input: string,
  range: PublicSourceRange,
  label: string,
): string | null {
  let lines: string[];
  try {
    lines = readFileSync(file, "utf-8").split(/\r\n|\r|\n/);
  } catch {
    return `Cannot read file: \`${input}\``;
  }
  for (const end of ["start", "end"] as const) {
    const { line, character } = range[end];
    if (line > lines.length) {
      return `${label}.${end} line ${line} is beyond the end of \`${input}\` (${lines.length} lines).`;
    }
    const maximum = (lines[line - 1] ?? "").length + 1;
    if (character > maximum) {
      return `${label}.${end} character ${character} is beyond line ${line} of \`${input}\` (maximum ${maximum}, 1-based UTF-16).`;
    }
  }
  return null;
}

function toLspRange(range: PublicSourceRange): SourceRange {
  return {
    start: toLspPosition(range.start.line, range.start.character),
    end: toLspPosition(range.end.line, range.end.character),
  };
}
