/** Session-owned refactor planning and apply workflows. */

import type {
  RefactorOperation,
  RefactorResult,
  SemanticProvider,
  SourceRange,
} from "@mrclrchtr/supi-code-runtime/api";
import { toLspPosition } from "@mrclrchtr/supi-lsp/api";
import { SEMANTIC_READINESS_TIMEOUT_REASON } from "../analysis/readiness.ts";
import { applyWorkspaceEdit } from "../analysis/refactor/apply.ts";
import {
  isLatexSectionTarget,
  refineLatexSectionRenameResult,
} from "../analysis/refactor/latex-section-rename.ts";
import {
  establishMutationAuthority,
  revalidateMutationAuthority,
} from "../analysis/refactor/mutation-authority.ts";
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
import {
  PUBLIC_REFACTOR_OPERATION_NAMES,
  type PublicSourceRange,
  type RefactorApplyWorkflowInput,
  type RefactorApplyWorkflowOutcome,
  type RefactorOperationInput,
  type RefactorPlanWorkflowInput,
  type RefactorPlanWorkflowOutcome,
} from "./refactor-types.ts";
import type { TargetStoreEntry } from "./target-store.ts";
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
    control,
  );
  throwIfAborted(control);
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

  const readiness = await deps.capability.ensureSemanticReadiness(
    deps.cwd,
    { kind: "file", file: target.entry.file },
    control,
  );
  if (readiness.kind === "timeout") {
    return { kind: "unavailable", reason: SEMANTIC_READINESS_TIMEOUT_REASON };
  }
  if (readiness.kind === "unavailable") return readiness;
  throwIfAborted(control);
  return planResolvedRefactor(parsed, target.entry, deps, control);
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

  const authority = revalidateMutationAuthority(
    plan.edits.edits.map((edit) => edit.file),
    plan.authorizedMutationRoots,
  );
  if (authority.kind === "unavailable") return authority;
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
  const getOpenDocumentVersion = getDocumentVersionReader(deps);
  const result = await applyWorkspaceEdit(plan.edits, {
    authorizedMutationRoots: plan.authorizedMutationRoots,
    expectedFingerprints,
    getOpenDocumentVersion,
  });
  if (result.kind === "error") return { kind: "unavailable", reason: result.reason };
  deps.removePlan(plan.id);
  return { kind: "completed", plan: immutablePlan(plan), result };
}

type ParsedRefactorOperation = Extract<ReturnType<typeof parseOperation>, { kind: "ok" }>;
type RefinedRefactorResult = Awaited<ReturnType<typeof refineLatexSectionRenameResult>>;

async function planResolvedRefactor(
  parsed: ParsedRefactorOperation,
  target: Readonly<TargetStoreEntry>,
  deps: RefactorWorkflowDeps,
  control?: WorkflowControl,
): Promise<RefactorPlanWorkflowOutcome> {
  const file = normalizePath(target.file, deps.cwd);
  const sectionRename = await planWithLatexSafety({ parsed, target, file, deps, control });
  const result = sectionRename.result;
  if (result.kind === "unavailable") return result;
  if (result.kind === "ambiguous") {
    return { kind: "ambiguous", candidates: result.candidates };
  }
  if (
    sectionRename.sourceFingerprint &&
    computeFileFingerprint(file) !== sectionRename.sourceFingerprint
  ) {
    return {
      kind: "unavailable",
      reason: "The LaTeX source changed before the title rename plan was stored.",
    };
  }

  const validation = validateEdit(result.edits);
  if (!validation.safe) {
    return { kind: "invalid-input", message: `Refactor safety check failed: ${validation.reason}` };
  }
  const authority = establishMutationAuthority(
    result.edits.edits.map((edit) => edit.file),
    result.authorizedMutationRoots,
  );
  if (authority.kind === "unavailable") return authority;

  const plan: RefactorPlan = {
    id: generatePlanId(
      parsed.operation,
      file,
      target.displayLine,
      target.displayCharacter,
      parsed.newName,
    ),
    operation: parsed.operation,
    newName: parsed.newName,
    targetFile: file,
    targetLine: target.displayLine,
    targetCharacter: target.displayCharacter,
    edits: result.edits,
    evidenceSource: sectionRename.evidenceSource,
    authorizedMutationRoots: authority.canonicalRoots,
    fileFingerprints: collectFileFingerprints(
      result.edits.edits,
      sectionRename.sourceFingerprint
        ? { file, fingerprint: sectionRename.sourceFingerprint }
        : undefined,
    ),
    createdAt: Date.now(),
  };
  deps.storePlan(plan);
  return { kind: "completed", plan: immutablePlan(plan) };
}

async function planWithLatexSafety(input: {
  readonly parsed: ParsedRefactorOperation;
  readonly target: Readonly<TargetStoreEntry>;
  readonly file: string;
  readonly deps: RefactorWorkflowDeps;
  readonly control?: WorkflowControl;
}): Promise<RefinedRefactorResult> {
  const { parsed, target, file, deps, control } = input;
  const isLatexRename = parsed.operation === "rename_symbol" && isLatexSectionTarget(target);
  if (isLatexRename && computeFileFingerprint(file) !== target.fileFingerprint) {
    return {
      result: {
        kind: "unavailable",
        reason: "The LaTeX source changed after the target was resolved. Re-resolve the target.",
      },
      evidenceSource: "semantic",
    };
  }

  const result = await planWithProvider(
    deps.capability.getSemanticProvider(deps.cwd),
    {
      operation: parsed.operation,
      file,
      position: toLspPosition(target.displayLine, target.displayCharacter),
      range: parsed.range ? toLspRange(parsed.range) : undefined,
      newName: parsed.newName,
    },
    control,
  );
  if (isLatexRename && computeFileFingerprint(file) !== target.fileFingerprint) {
    return {
      result: {
        kind: "unavailable",
        reason: "The LaTeX source changed while the rename provider was working.",
      },
      evidenceSource: "semantic",
    };
  }
  return refineLatexSectionRenameResult({
    operation: parsed.operation,
    result,
    target,
    file,
    newName: parsed.newName,
    structural: deps.capability.getStructuralProvider(deps.cwd),
    documentVersionReader: getDocumentVersionReader(deps),
    control,
  });
}

function getDocumentVersionReader(
  deps: RefactorWorkflowDeps,
): ((file: string) => number | null) | undefined {
  const state = deps.capability.getLspRuntimeState(deps.cwd);
  if (state.kind !== "ready" && state.kind !== "inactive") return undefined;
  if (typeof state.runtime.getOpenDocumentVersion !== "function") return undefined;
  return (file) => state.runtime.getOpenDocumentVersion(file);
}

function parseOperation(input: RefactorOperationInput):
  | {
      kind: "ok";
      operation: RefactorOperation;
      newName?: string;
      range?: PublicSourceRange;
    }
  | { kind: "invalid-input"; message: string } {
  const keys = PUBLIC_REFACTOR_OPERATION_NAMES.filter((key) => key in input);
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
  if ("extract_variable" in input) {
    return {
      kind: "ok",
      operation: "extract_variable",
      newName: input.extract_variable.newName,
      range: input.extract_variable.range,
    };
  }
  return {
    kind: "ok",
    operation: "update_imports" in input ? "update_imports" : "delete_dead_code",
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
    newName?: string;
  },
  control?: WorkflowControl,
): Promise<RefactorResult> {
  if (!provider) return { kind: "unavailable", reason: "No semantic provider is active." };
  if (provider.refactor) return provider.refactor(request, control);
  if (request.operation === "rename_symbol" && request.newName !== undefined && provider.rename) {
    return provider.rename(request.file, request.position, request.newName, control);
  }
  return {
    kind: "unavailable",
    reason: `The semantic provider cannot plan ${request.operation}.`,
  };
}

function collectFileFingerprints(
  edits: Array<{ file: string }>,
  sourceSnapshot?: { readonly file: string; readonly fingerprint: string },
): Array<{ file: string; fingerprint: string }> {
  const files = [...new Set(edits.map((edit) => edit.file))];
  return files.map((file) => ({
    file,
    fingerprint:
      sourceSnapshot?.file === file ? sourceSnapshot.fingerprint : computeFileFingerprint(file),
  }));
}

function immutablePlan(plan: RefactorPlan): Readonly<RefactorPlan> {
  return Object.freeze({
    ...plan,
    edits: Object.freeze({
      ...plan.edits,
      edits: Object.freeze(plan.edits.edits.map((edit) => Object.freeze({ ...edit }))),
      documentPreconditions: plan.edits.documentPreconditions
        ? Object.freeze(
            plan.edits.documentPreconditions.map((precondition) =>
              Object.freeze({ ...precondition }),
            ),
          )
        : undefined,
    }),
    authorizedMutationRoots: Object.freeze([...plan.authorizedMutationRoots]),
    fileFingerprints: Object.freeze(
      plan.fileFingerprints.map((fingerprint) => Object.freeze({ ...fingerprint })),
    ),
  }) as Readonly<RefactorPlan>;
}
