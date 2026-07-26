import { expect, it } from "vitest";
import type { BriefSynthesisRunResult, ChildFailureDiagnostics } from "../../src/types.ts";

const diagnostics: ChildFailureDiagnostics = {
  lifecycleTrace: { entries: [], droppedCount: 0 },
  turns: 0,
  toolUses: 0,
};

it("encodes the child-failure diagnostics invariant", () => {
  const creationFailure = {
    kind: "failed",
    failureCode: "session-creation-failed",
  } satisfies BriefSynthesisRunResult;
  const observedFailure = {
    kind: "failed",
    failureCode: "prompt-rejected",
    diagnostics,
  } satisfies BriefSynthesisRunResult;

  // @ts-expect-error — observed child failures must carry diagnostics
  const missingDiagnostics: BriefSynthesisRunResult = {
    kind: "failed",
    failureCode: "prompt-rejected",
  };
  const creationDiagnostics: BriefSynthesisRunResult = {
    kind: "failed",
    failureCode: "session-creation-failed",
    // @ts-expect-error — session creation has no observed child lifecycle
    diagnostics,
  };

  expect(creationFailure.failureCode).toBe("session-creation-failed");
  expect(observedFailure.diagnostics).toBe(diagnostics);
  void missingDiagnostics;
  void creationDiagnostics;
});
