/** Shared refactor-plan pipeline: provider calls, readiness, validation, and plan storage. */

import type {
  RefactorOperation,
  RefactorRequest,
  RefactorResult,
  SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { SEMANTIC_READINESS_TIMEOUT_REASON } from "../analysis/readiness.ts";
import { establishMutationAuthority } from "../analysis/refactor/mutation-authority.ts";
import { validateEdit } from "../analysis/refactor/safety.ts";
import type { CapabilityAdapter } from "./capability-adapter.ts";
import { collectFileFingerprints, dropIdentityEdits } from "./refactor-identity.ts";
import {
  generatePlanId,
  type RefactorPlan,
  validateSynchronizedContentFingerprints,
} from "./refactor-plans.ts";
import type { RefactorPlanWorkflowOutcome } from "./refactor-types.ts";
import type { TargetWorkflowDeps } from "./target-workflow.ts";
import { throwIfAborted, type WorkflowControl } from "./workflow-control.ts";

/** Session collaborators for refactor planning and apply workflows. */
export interface RefactorWorkflowDeps extends TargetWorkflowDeps {
  readonly capability: CapabilityAdapter;
  readonly storePlan: (plan: RefactorPlan) => string;
  readonly getPlan: (id: string) => RefactorPlan | undefined;
  readonly removePlan: (id: string) => void;
}

/** Wait for semantic readiness for one file; returns an outcome only when planning must stop. */
export async function ensureFileReadiness(
  file: string,
  deps: RefactorWorkflowDeps,
  control?: WorkflowControl,
): Promise<RefactorPlanWorkflowOutcome | null> {
  const readiness = await deps.capability.ensureSemanticReadiness(
    deps.cwd,
    { kind: "file", file },
    control,
  );
  throwIfAborted(control);
  if (readiness.kind === "timeout") {
    return { kind: "unavailable", reason: SEMANTIC_READINESS_TIMEOUT_REASON };
  }
  if (readiness.kind === "unavailable") return readiness;
  return null;
}

/** Validate a provider result and store it as a fingerprinted plan. */
export async function finishProviderPlan(
  result: RefactorResult,
  deps: RefactorWorkflowDeps,
  plan: {
    readonly operation: RefactorOperation;
    readonly file: string;
    readonly discriminator: string;
    readonly fields: Pick<RefactorPlan, "newName" | "target" | "range">;
    readonly evidenceSource: "semantic" | "structural";
    readonly sourceFingerprint?: string;
  },
): Promise<RefactorPlanWorkflowOutcome> {
  if (result.kind === "unavailable") return { kind: "unavailable", reason: result.reason };
  if (result.kind === "ambiguous") {
    return { kind: "ambiguous", candidates: result.candidates };
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
  const fileFingerprints = collectFileFingerprints(
    result.edits.edits,
    plan.sourceFingerprint ? { file: plan.file, fingerprint: plan.sourceFingerprint } : undefined,
  );
  const snapshotError = validateSynchronizedContentFingerprints(
    result.edits.documentPreconditions,
    fileFingerprints,
    deps.cwd,
  );
  if (snapshotError) return { kind: "unavailable", reason: snapshotError };
  const changed = dropIdentityEdits(result.edits, fileFingerprints);
  if (changed.kind === "unavailable") return changed;
  if (changed.edits.edits.length === 0) {
    return {
      kind: "invalid-input",
      message: `The ${plan.operation} refactor produces no changes; every planned edit matches the current text.`,
    };
  }

  const stored: RefactorPlan = {
    id: generatePlanId(plan.operation, plan.file, plan.discriminator),
    operation: plan.operation,
    file: plan.file,
    ...plan.fields,
    ...(result.action ? { action: { ...result.action } } : {}),
    edits: changed.edits,
    evidenceSource: plan.evidenceSource,
    authorizedMutationRoots: authority.canonicalRoots,
    fileFingerprints: changed.fileFingerprints,
    createdAt: Date.now(),
  };
  deps.storePlan(stored);
  return { kind: "completed", plan: immutablePlan(stored) };
}

/** Ask the active semantic provider for one refactor result. */
export async function planWithProvider(
  provider: SemanticProvider | null,
  request: RefactorRequest,
  control?: WorkflowControl,
): Promise<RefactorResult> {
  if (!provider) return { kind: "unavailable", reason: "No semantic provider is active." };
  if (provider.refactor) return provider.refactor(request, control);
  if (request.operation === "rename_symbol" && provider.rename) {
    return provider.rename(request.file, request.position, request.newName, control);
  }
  return {
    kind: "unavailable",
    reason: `The semantic provider cannot plan ${request.operation}.`,
  };
}

/** Freeze a stored plan before it leaves the session. */
export function immutablePlan(plan: RefactorPlan): Readonly<RefactorPlan> {
  return Object.freeze({
    ...plan,
    ...(plan.target ? { target: Object.freeze({ ...plan.target }) } : {}),
    ...(plan.range ? { range: Object.freeze({ ...plan.range }) } : {}),
    ...(plan.action ? { action: Object.freeze({ ...plan.action }) } : {}),
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
