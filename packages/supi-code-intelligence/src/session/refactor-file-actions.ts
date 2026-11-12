/** Code- and source-action refactor planning for one named file. */

import { existsSync, statSync } from "node:fs";
import type { RefactorRequest, SourceRange } from "@mrclrchtr/supi-code-runtime/api";
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
  const fileError = validateActionFile(file, selection.file, `operation.${name}.file`);
  if (fileError) return { kind: "invalid-input", message: fileError };

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

function validateActionFile(file: string, input: string, label: string): string | null {
  if (!existsSync(file)) return `File not found: \`${input}\``;
  if (statSync(file).isDirectory()) {
    return `${label} must be a file, not a directory: \`${input}\`.`;
  }
  return null;
}

function toLspRange(range: PublicSourceRange): SourceRange {
  return {
    start: toLspPosition(range.start.line, range.start.character),
    end: toLspPosition(range.end.line, range.end.character),
  };
}
