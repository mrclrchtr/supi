import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";
import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runGraphWorkflow } from "../../../src/session/graph-workflow.ts";
import type { TargetStoreEntry } from "../../../src/session/target-store.ts";
import { getWorkflowTarget, registerWorkflowTarget } from "../../../src/session/target-store.ts";
import type { TargetWorkflowDeps } from "../../../src/session/target-workflow.ts";
import { finishGraphResult } from "../../../src/tool/code_graph/result.ts";
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
        kind: "partial" as const,
        file: "src/index.ts",
        reason: "Tree-sitter recovered syntax.",
        errorRanges: [{ start: { line: 0, character: 20 }, end: { line: 0, character: 20 } }],
        data: {
          enclosingScope: { name: "oldName", startLine: 1, endLine: 1 },
          callees: [
            {
              name: "helper",
              startLine: 1,
              startCharacter: 25,
              endLine: 1,
              endCharacter: 31,
            },
          ],
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
        expect.objectContaining({
          kind: "ok",
          rel: "callees",
          data: expect.objectContaining({
            calls: [expect.objectContaining({ name: "helper" })],
            recovery: {
              file: "src/index.ts",
              reason: "Tree-sitter recovered syntax.",
              errorRanges: [{ start: { line: 0, character: 20 }, end: { line: 0, character: 20 } }],
            },
          }),
        }),
      ]),
    );
  });

  it("preserves an unavailable implementation reason in mixed Markdown and structured evidence", async () => {
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
    const reason = "This language server does not provide implementation lookup.";
    const deps: TargetWorkflowDeps = {
      cwd,
      capability: new TestCapabilityAdapter({
        semantic: {
          references: async () => completedCodeQuery([]),
          implementation: async () => ({ kind: "unavailable", reason }),
          documentSymbols: async () => completedCodeQuery([]),
          workspaceSymbols: async () => completedCodeQuery([]),
        },
      }),
      lookupTargetId: (targetId) => getWorkflowTarget(store, targetId),
      registerTarget: (input) => registerWorkflowTarget(store, cwd, input),
    };

    const outcome = await runGraphWorkflow(
      { target: { handle: entry.targetId }, relations: ["references", "implements"] },
      deps,
    );

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") return;
    const result = finishGraphResult(outcome, cwd);
    expect(result.content).toContain(`Unavailable — ${reason}`);
    expect(result.details).toMatchObject({
      type: "graph",
      data: {
        sections: expect.arrayContaining([
          expect.objectContaining({ rel: "implements", message: reason }),
        ]),
      },
    });
  });

  it("throws every distinct provider absence reason when all graph relations are unavailable", async () => {
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
    const deps: TargetWorkflowDeps = {
      cwd,
      capability: new TestCapabilityAdapter({}),
      lookupTargetId: (targetId) => getWorkflowTarget(store, targetId),
      registerTarget: (input) => registerWorkflowTarget(store, cwd, input),
    };

    const outcome = await runGraphWorkflow(
      { target: { handle: entry.targetId }, relations: ["references", "implements"] },
      deps,
    );

    expect(outcome).toEqual({
      kind: "unavailable",
      reason: "No semantic references provider; No semantic implementations provider",
    });
    expect(() => finishGraphResult(outcome, cwd)).toThrow(
      "No semantic references provider; No semantic implementations provider",
    );
  });
});
