/** Session-owned refactor planning and apply workflows. */

import { toLspPosition } from "@mrclrchtr/supi-lsp/api";
import { applyWorkspaceEdit } from "../analysis/refactor/apply.ts";
import {
  isLatexSectionTarget,
  refineLatexSectionRenameResult,
} from "../analysis/refactor/latex-section-rename.ts";
import { revalidateMutationAuthority } from "../analysis/refactor/mutation-authority.ts";
import { validateEdit } from "../analysis/refactor/safety.ts";
import { normalizePath } from "../analysis/search/paths.ts";
import {
  parseRefactorApplyWorkflowInput,
  parseRefactorPlanWorkflowInput,
} from "./input/health-refactor.ts";
import { planFileAction } from "./refactor-file-actions.ts";
import {
  ensureFileReadiness,
  finishProviderPlan,
  immutablePlan,
  planWithProvider,
  type RefactorWorkflowDeps,
} from "./refactor-plan-pipeline.ts";
import { computeFileFingerprint, isPlanFresh } from "./refactor-plans.ts";
import type {
  RefactorApplyWorkflowInput,
  RefactorApplyWorkflowOutcome,
  RefactorOperationInput,
  RefactorPlanWorkflowInput,
  RefactorPlanWorkflowOutcome,
} from "./refactor-types.ts";
import type { TargetStoreEntry } from "./target-store.ts";
import { resolveTargetWorkflow } from "./target-workflow.ts";
import { reportProgress, throwIfAborted, type WorkflowControl } from "./workflow-control.ts";

/** Plan one precise refactor without mutating files. */
export async function runRefactorPlanWorkflow(
  input: RefactorPlanWorkflowInput,
  deps: RefactorWorkflowDeps,
  control?: WorkflowControl,
): Promise<RefactorPlanWorkflowOutcome> {
  const validatedInput = parseRefactorPlanWorkflowInput(input);
  if (validatedInput.kind === "invalid-input") return validatedInput;
  const { operation } = validatedInput.value;
  throwIfAborted(control);
  if ("rename_symbol" in operation) {
    return planRename(operation.rename_symbol, deps, control);
  }
  return planFileAction(operation, deps, control);
}

async function planRename(
  input: Extract<RefactorOperationInput, { rename_symbol: unknown }>["rename_symbol"],
  deps: RefactorWorkflowDeps,
  control?: WorkflowControl,
): Promise<RefactorPlanWorkflowOutcome> {
  reportProgress(control, {
    intent: "refactor-plan",
    phase: "target",
    message: "Resolving refactor target",
  });
  const target = await resolveTargetWorkflow(
    input.target,
    { fileLevelAllowed: false, nameAnchorRequired: true },
    deps,
    control,
  );
  throwIfAborted(control);
  if (target.kind === "file-outline") {
    return {
      kind: "invalid-input",
      message:
        "Rename requires one declaration, not a whole file. Pass one handle from the file outline as target.handle.",
    };
  }
  if (target.kind === "disambiguation" || target.kind === "kind-mismatch") {
    return {
      kind: "invalid-input",
      message: "Rename requires one precise target handle or anchor.",
    };
  }
  if (target.kind !== "resolved") return target;

  const file = normalizePath(target.entry.file, deps.cwd);
  const readiness = await ensureFileReadiness(file, deps, control);
  if (readiness) return readiness;
  const sectionRename = await planWithLatexSafety({
    newName: input.newName,
    target: target.entry,
    file,
    deps,
    control,
  });
  if (
    sectionRename.result.kind === "precise" &&
    sectionRename.sourceFingerprint &&
    computeFileFingerprint(file) !== sectionRename.sourceFingerprint
  ) {
    return {
      kind: "unavailable",
      reason: "The LaTeX source changed before the title rename plan was stored.",
    };
  }
  return finishProviderPlan(sectionRename.result, deps, {
    operation: "rename_symbol",
    file,
    discriminator: `${target.entry.displayLine}:${target.entry.displayCharacter}:${input.newName}`,
    fields: {
      newName: input.newName,
      target: { line: target.entry.displayLine, character: target.entry.displayCharacter },
    },
    evidenceSource: sectionRename.evidenceSource,
    sourceFingerprint: sectionRename.sourceFingerprint,
  });
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
  const freshness = isPlanFresh(plan, deps.cwd);
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
  const result = await applyWorkspaceEdit(plan.edits, {
    cwd: deps.cwd,
    authorizedMutationRoots: plan.authorizedMutationRoots,
    expectedFingerprints,
    getOpenDocumentVersion: getDocumentVersionReader(deps),
  });
  if (result.kind === "error") return { kind: "unavailable", reason: result.reason };
  deps.removePlan(plan.id);
  return { kind: "completed", plan: immutablePlan(plan), result };
}

type RefinedRefactorResult = Awaited<ReturnType<typeof refineLatexSectionRenameResult>>;

async function planWithLatexSafety(input: {
  readonly newName: string;
  readonly target: Readonly<TargetStoreEntry>;
  readonly file: string;
  readonly deps: RefactorWorkflowDeps;
  readonly control?: WorkflowControl;
}): Promise<RefinedRefactorResult> {
  const { newName, target, file, deps, control } = input;
  const isLatexRename = isLatexSectionTarget(target);
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
      operation: "rename_symbol",
      file,
      position: toLspPosition(target.displayLine, target.displayCharacter),
      newName,
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
    operation: "rename_symbol",
    result,
    target,
    file,
    newName,
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
