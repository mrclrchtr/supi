import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runGraphWorkflow } from "../../../src/session/graph-workflow.ts";
import type { TargetStoreEntry } from "../../../src/session/target-store.ts";
import { getWorkflowTarget, registerWorkflowTarget } from "../../../src/session/target-store.ts";
import type { TargetWorkflowDeps } from "../../../src/session/target-workflow.ts";
import { TestCapabilityAdapter } from "../../helpers/test-capability-adapter.ts";

let cwd: string;
let store: Map<string, TargetStoreEntry>;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "graph-workflow-"));
  mkdirSync(path.join(cwd, "src"), { recursive: true });
  writeFileSync(path.join(cwd, "src", "index.ts"), "function oldName() {}\n");
  store = new Map();
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("runGraphWorkflow", () => {
  it("keeps semantic graph readiness notes actionable beside structural results", async () => {
    const { entry } = registerWorkflowTarget(store, cwd, {
      file: "src/index.ts",
      position: { line: 0, character: 9 },
      displayLine: 1,
      displayCharacter: 10,
      name: "oldName",
      kind: "Function",
      confidence: "semantic",
      provenance: ["semantic"],
      anchorKind: "name",
      container: null,
    });
    const structural = {
      calleesAt: async () => ({
        kind: "success" as const,
        data: {
          enclosingScope: { name: "oldName", startLine: 1, endLine: 1 },
          callees: [],
          depth: "direct" as const,
        },
      }),
    } as unknown as StructuralProvider;
    const deps: TargetWorkflowDeps = {
      cwd,
      capability: new TestCapabilityAdapter({
        structural,
        readiness: { kind: "timeout" },
      }),
      lookupTargetId: (targetId) => getWorkflowTarget(store, targetId),
      registerTarget: (input) => registerWorkflowTarget(store, cwd, input),
    };

    const outcome = await runGraphWorkflow(
      {
        target: { handle: entry.targetId },
        relations: ["references", "callees"],
      },
      deps,
    );

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    expect(outcome.sections).toEqual(
      expect.arrayContaining([
        {
          kind: "unavailable",
          rel: "references",
          message: "Semantic readiness timed out. Retry shortly or inspect code_health.",
        },
        expect.objectContaining({ kind: "ok", rel: "callees" }),
      ]),
    );
  });
});
