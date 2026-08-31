import { expect, it } from "vitest";
import type { ChildFailureDiagnostics, ReviewerRunResult } from "../../src/types.ts";

const diagnostics: ChildFailureDiagnostics = {
  lifecycleTrace: { entries: [], droppedCount: 0 },
  turns: 0,
  toolUses: 0,
};

it("encodes the child-failure diagnostics invariant", () => {
  const creationFailure = {
    kind: "failed",
    failureCode: "session-creation-failed",
    modelId: "provider/model",
    requestedThinkingLevel: "max",
    effectiveThinkingLevel: "max",
    reviewerExtensionSetStatus: "unobserved",
  } satisfies ReviewerRunResult;
  const observedFailure = {
    kind: "failed",
    failureCode: "prompt-rejected",
    modelId: "provider/model",
    requestedThinkingLevel: "max",
    effectiveThinkingLevel: "max",
    reviewerExtensionSetStatus: "active",
    diagnostics,
  } satisfies ReviewerRunResult;

  // @ts-expect-error — observed child failures must carry diagnostics
  const missingDiagnostics: ReviewerRunResult = {
    kind: "failed",
    failureCode: "prompt-rejected",
    modelId: "provider/model",
    requestedThinkingLevel: "max",
    effectiveThinkingLevel: "max",
    reviewerExtensionSetStatus: "active",
  };
  const creationDiagnostics: ReviewerRunResult = {
    kind: "failed",
    failureCode: "session-creation-failed",
    modelId: "provider/model",
    requestedThinkingLevel: "max",
    effectiveThinkingLevel: "max",
    reviewerExtensionSetStatus: "unobserved",
    // @ts-expect-error — session creation has no observed child lifecycle
    diagnostics,
  };

  expect(creationFailure.failureCode).toBe("session-creation-failed");
  expect(observedFailure.diagnostics).toBe(diagnostics);
  void missingDiagnostics;
  void creationDiagnostics;
});
