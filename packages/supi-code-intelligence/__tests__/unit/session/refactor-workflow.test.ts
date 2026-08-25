import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SemanticProvider } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type RefactorWorkflowDeps,
  runRefactorPlanWorkflow,
} from "../../../src/session/refactor-workflow.ts";
import {
  getWorkflowTarget,
  registerWorkflowTarget,
  type TargetStoreEntry,
} from "../../../src/session/target-store.ts";
import { TestCapabilityAdapter } from "../../helpers/test-capability-adapter.ts";

let cwd: string;
let store: Map<string, TargetStoreEntry>;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "refactor-workflow-"));
  mkdirSync(path.join(cwd, "src"), { recursive: true });
  writeFileSync(path.join(cwd, "src", "index.ts"), "oldName();\n");
  store = new Map();
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("runRefactorPlanWorkflow", () => {
  it("reports a post-target semantic readiness timeout with retry guidance", async () => {
    const { entry } = registerWorkflowTarget(store, cwd, {
      file: "src/index.ts",
      position: { line: 0, character: 0 },
      displayLine: 1,
      displayCharacter: 1,
      name: "oldName",
      kind: "Function",
      confidence: "semantic",
      provenance: ["semantic"],
      anchorKind: "name",
      container: null,
    });
    const deps: RefactorWorkflowDeps = {
      cwd,
      capability: new TestCapabilityAdapter({
        semantic: {} as SemanticProvider,
        readiness: { kind: "timeout" },
      }),
      lookupTargetId: (targetId) => getWorkflowTarget(store, targetId),
      registerTarget: (input) => registerWorkflowTarget(store, cwd, input),
      storePlan: () => "plan-id",
      getPlan: () => undefined,
      removePlan: () => undefined,
    };

    const outcome = await runRefactorPlanWorkflow(
      {
        target: { handle: entry.targetId },
        operation: { rename_symbol: { newName: "newName" } },
      },
      deps,
    );

    expect(outcome).toEqual({
      kind: "unavailable",
      reason: "Semantic provider did not become ready within the wait window; retry shortly.",
    });
  });
});
