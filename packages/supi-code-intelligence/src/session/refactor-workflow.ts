/** Session-owned refactor planning and apply workflows. */

import type {
  RefactorOperation,
  RefactorResult,
  SemanticProvider,
  SourceRange,
} from "@mrclrchtr/supi-code-runtime/api";
import { toLspPosition } from "@mrclrchtr/supi-lsp/api";
import { applyWorkspaceEdit } from "../analysis/refactor/apply.ts";
import { validateEdit } from "../analysis/refactor/safety.ts";
import { normalizePath } from "../analysis/search/paths.ts";
import type { CapabilityAdapter } from "./capability-adapter.ts";
import {
  parseRefactorApplyWorkflowInput,
  parseRefactorPlanWorkflowInput,
} from "./input/health-refactor.ts";
import {
  computeFileFingerprint,
  generatePlanId,
  isPlanFresh,
  type RefactorPlan,
} from "./refactor-plans.ts";
import type {
  PublicSourceRange,
  RefactorApplyWorkflowInput,
  RefactorApplyWorkflowOutcome,
  RefactorOperationInput,
  RefactorPlanWorkflowInput,
  RefactorPlanWorkflowOutcome,
} from "./refactor-types.ts";
import { resolveTargetWorkflow, type TargetWorkflowDeps } from "./target-workflow.ts";
import { reportProgress, throwIfAborted, type WorkflowControl } from "./workflow-control.ts";

export interface RefactorWorkflowDeps extends TargetWorkflowDeps {
  readonly capability: CapabilityAdapter;
  readonly storePlan: (plan: RefactorPlan) => string;
  readonly getPlan: (id: string) => RefactorPlan | undefined;
  readonly removePlan: (id: string) => void;
}

/** Plan one precise refactor without mutating files. */
export async function runRefactorPlanWorkflow(
  input: RefactorPlanWorkflowInput,
  deps: RefactorWorkflowDeps,
  control?: WorkflowControl,
): Promise<RefactorPlanWorkflowOutcome> {
  const validatedInput = parseRefactorPlanWorkflowInput(input);
  if (validatedInput.kind === "invalid-input") return validatedInput;
  const request = validatedInput.value;
  const parsed = parseOperation(request.operation);
  if (parsed.kind === "invalid-input") return parsed;
  const rangeError = parsed.range ? validateRange(parsed.range) : null;
  if (rangeError) return { kind: "invalid-input", message: rangeError };

  throwIfAborted(control);
  reportProgress(control, {
    intent: "refactor-plan",
    phase: "target",
    message: "Resolving refactor target",
  });
  const target = await resolveTargetWorkflow(
    request.target,
    {
      fileLevelAllowed: false,
      nameAnchorRequired: parsed.operation === "rename_symbol",
    },
    deps,
  );
  if (target.kind === "target-group") {
    return {
      kind: "invalid-input",
      message: "Refactor planning requires one member handle from a Target group.",
    };
  }
  if (target.kind === "disambiguation" || target.kind === "kind-mismatch") {
    return {
      kind: "invalid-input",
      message: "Refactor planning requires one precise target handle or anchor.",
    };
  }
  if (target.kind !== "resolved") return target;

  const readiness = await deps.capability.ensureSemanticReadiness(deps.cwd, {
    kind: "file",
    file: target.entry.file,
  });
  if (readiness.kind === "timeout") {
    return { kind: "unavailable", reason: "Semantic readiness timed out." };
  }
  if (readiness.kind === "unavailable") return readiness;
  throwIfAborted(control);

  const file = normalizePath(target.entry.file, deps.cwd);
  const result = await planWithProvider(deps.capability.getSemanticProvider(deps.cwd), {
    operation: parsed.operation,
    file,
    position: toLspPosition(target.entry.displayLine, target.entry.displayCharacter),
    range: parsed.range ? toLspRange(parsed.range) : undefined,
    newName: parsed.newName,
  });
  if (result.kind === "unavailable") return result;
  if (result.kind === "ambiguous") {
    return { kind: "ambiguous", candidates: result.candidates };
  }

  const validation = validateEdit(result.edits);
  if (!validation.safe) {
    return { kind: "invalid-input", message: `Refactor safety check failed: ${validation.reason}` };
  }

  const plan: RefactorPlan = {
    id: generatePlanId(
      parsed.operation,
      file,
      target.entry.displayLine,
      target.entry.displayCharacter,
      parsed.newName,
    ),
    operation: parsed.operation,
    newName: parsed.newName,
    targetFile: file,
    targetLine: target.entry.displayLine,
    targetCharacter: target.entry.displayCharacter,
    edits: result.edits,
    fileFingerprints: collectFileFingerprints(result.edits.edits),
    createdAt: Date.now(),
  };
  deps.storePlan(plan);
  return { kind: "completed", plan: immutablePlan(plan) };
}

/** Revalidate and apply one stored plan through the per-file mutation queue. */
export async function runRefactorApplyWorkflow(
  input: RefactorApplyWorkflowInput,
  deps: RefactorWorkflowDeps,
  control?: WorkflowControl,
): Promise<RefactorApplyWorkflowOutcome> {
  const validatedInput = parseRefactorApplyWorkflowInput(input);
  if (validatedInput.kind === "invalid-input") return validatedInput;
  const request = validatedInput.value;
  const plan = deps.getPlan(request.planId);
  if (!plan) {
    return {
      kind: "invalid-input",
      message: `Plan "${request.planId}" was not found in this session.`,
    };
  }

  const freshness = isPlanFresh(plan);
  if (!freshness.fresh) return { kind: "invalid-input", message: freshness.reason };
  const validation = validateEdit(plan.edits);
  if (!validation.safe) return { kind: "invalid-input", message: validation.reason };

  throwIfAborted(control);
  reportProgress(control, {
    intent: "refactor-apply",
    phase: "mutation",
    message: "Applying fingerprint-checked refactor edits",
  });
  const expectedFingerprints = new Map(
    plan.fileFingerprints.map(({ file, fingerprint }) => [file, fingerprint]),
  );
  const result = await applyWorkspaceEdit(plan.edits, { expectedFingerprints });
  if (result.kind === "error") return { kind: "unavailable", reason: result.reason };
  deps.removePlan(plan.id);
  return { kind: "completed", plan: immutablePlan(plan), result };
}

function parseOperation(input: RefactorOperationInput):
  | {
      kind: "ok";
      operation: RefactorOperation;
      newName: string;
      range?: PublicSourceRange;
    }
  | { kind: "invalid-input"; message: string } {
  const keys = ["rename_symbol", "extract_function", "extract_variable"].filter(
    (key) => key in input,
  );
  if (keys.length !== 1) {
    return { kind: "invalid-input", message: "Select exactly one refactor operation." };
  }
  if ("rename_symbol" in input) {
    return {
      kind: "ok",
      operation: "rename_symbol",
      newName: input.rename_symbol.newName,
    };
  }
  if ("extract_function" in input) {
    return {
      kind: "ok",
      operation: "extract_function",
      newName: input.extract_function.newName,
      range: input.extract_function.range,
    };
  }
  return {
    kind: "ok",
    operation: "extract_variable",
    newName: input.extract_variable.newName,
    range: input.extract_variable.range,
  };
}

function validateRange(range: PublicSourceRange): string | null {
  if (
    range.end.line < range.start.line ||
    (range.end.line === range.start.line && range.end.character <= range.start.character)
  ) {
    return "range.end must be after range.start.";
  }
  return null;
}

function toLspRange(range: PublicSourceRange): SourceRange {
  return {
    start: toLspPosition(range.start.line, range.start.character),
    end: toLspPosition(range.end.line, range.end.character),
  };
}

async function planWithProvider(
  provider: SemanticProvider | null,
  request: {
    operation: RefactorOperation;
    file: string;
    position: { line: number; character: number };
    range?: SourceRange;
    newName: string;
  },
): Promise<RefactorResult> {
  if (!provider) return { kind: "unavailable", reason: "No semantic provider is active." };
  if (provider.refactor) return provider.refactor(request);
  if (request.operation === "rename_symbol" && provider.rename) {
    return provider.rename(request.file, request.position, request.newName);
  }
  return {
    kind: "unavailable",
    reason: `The semantic provider cannot plan ${request.operation}.`,
  };
}

function collectFileFingerprints(
  edits: Array<{ file: string }>,
): Array<{ file: string; fingerprint: string }> {
  const files = [...new Set(edits.map((edit) => edit.file))];
  return files.map((file) => ({ file, fingerprint: computeFileFingerprint(file) }));
}

function immutablePlan(plan: RefactorPlan): Readonly<RefactorPlan> {
  return Object.freeze({
    ...plan,
    edits: Object.freeze({
      ...plan.edits,
      edits: Object.freeze(plan.edits.edits.map((edit) => Object.freeze({ ...edit }))),
    }),
    fileFingerprints: Object.freeze(
      plan.fileFingerprints.map((fingerprint) => Object.freeze({ ...fingerprint })),
    ),
  }) as Readonly<RefactorPlan>;
}
