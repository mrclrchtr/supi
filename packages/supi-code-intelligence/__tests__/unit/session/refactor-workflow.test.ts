import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { RefactorRequest, SemanticProvider } from "@mrclrchtr/supi-code-runtime/api";
import type { WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { createLspSemanticProvider } from "@mrclrchtr/supi-lsp/provider/lsp-semantic-provider";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RefactorWorkflowDeps } from "../../../src/session/refactor-plan-pipeline.ts";
import type { RefactorPlanWorkflowInput } from "../../../src/session/refactor-types.ts";
import { runRefactorPlanWorkflow } from "../../../src/session/refactor-workflow.ts";
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
  function deleteFirstLineProvider(requests: RefactorRequest[]): SemanticProvider {
    return {
      refactor: async (request) => {
        requests.push(request);
        return {
          kind: "precise",
          edits: {
            edits: [
              {
                file: path.join(cwd, "src", "index.ts"),
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
                newText: "",
              },
            ],
          },
          action: { kind: "source.organizeImports", title: "Organize imports" },
          authorizedMutationRoots: [cwd],
        };
      },
    } as SemanticProvider;
  }

  function depsWith(
    capability: TestCapabilityAdapter,
    storePlan: RefactorWorkflowDeps["storePlan"] = (plan) => plan.id,
  ): RefactorWorkflowDeps {
    return {
      cwd,
      capability,
      lookupTargetId: (targetId) => getWorkflowTarget(store, targetId),
      registerTarget: (input) => registerWorkflowTarget(store, cwd, input),
      storePlan,
      getPlan: () => undefined,
      removePlan: () => undefined,
    };
  }

  it("plans a source action for a whole file without resolving a symbol target", async () => {
    const requests: RefactorRequest[] = [];
    const outcome = await runRefactorPlanWorkflow(
      { operation: { source_action: { file: "src/index.ts", kind: "source.organizeImports" } } },
      depsWith(new TestCapabilityAdapter({ semantic: deleteFirstLineProvider(requests) })),
    );

    expect(requests).toEqual([
      {
        operation: "source_action",
        file: path.join(cwd, "src", "index.ts"),
        kind: "source.organizeImports",
      },
    ]);
    expect(outcome).toMatchObject({
      kind: "completed",
      plan: {
        operation: "source_action",
        file: path.join(cwd, "src", "index.ts"),
        action: { kind: "source.organizeImports", title: "Organize imports" },
      },
    });
  });

  it("sends a code action range in zero-based provider coordinates with the title", async () => {
    const requests: RefactorRequest[] = [];
    const outcome = await runRefactorPlanWorkflow(
      {
        operation: {
          code_action: {
            file: "src/index.ts",
            range: { start: { line: 1, character: 1 }, end: { line: 1, character: 8 } },
            kind: "refactor.extract",
            title: "Extract into variable",
          },
        },
      },
      depsWith(new TestCapabilityAdapter({ semantic: deleteFirstLineProvider(requests) })),
    );

    expect(requests).toEqual([
      {
        operation: "code_action",
        file: path.join(cwd, "src", "index.ts"),
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
        kind: "refactor.extract",
        title: "Extract into variable",
      },
    ]);
    expect(outcome).toMatchObject({
      kind: "completed",
      plan: {
        operation: "code_action",
        range: { start: { line: 1, character: 1 }, end: { line: 1, character: 8 } },
      },
    });
  });

  it("sends an empty cursor range to the provider", async () => {
    const requests: RefactorRequest[] = [];
    await runRefactorPlanWorkflow(
      {
        operation: {
          code_action: {
            file: "src/index.ts",
            range: { start: { line: 1, character: 3 }, end: { line: 1, character: 3 } },
            kind: "refactor.inline",
          },
        },
      },
      depsWith(new TestCapabilityAdapter({ semantic: deleteFirstLineProvider(requests) })),
    );

    expect(requests).toMatchObject([
      { range: { start: { line: 0, character: 2 }, end: { line: 0, character: 2 } } },
    ]);
  });

  it("reports semantic readiness timeouts for file operations", async () => {
    const outcome = await runRefactorPlanWorkflow(
      { operation: { source_action: { file: "src/index.ts", kind: "source" } } },
      depsWith(
        new TestCapabilityAdapter({
          semantic: {} as SemanticProvider,
          readiness: { kind: "timeout" },
        }),
      ),
    );

    expect(outcome).toEqual({
      kind: "unavailable",
      reason: "Semantic provider did not become ready within the wait window; retry shortly.",
    });
  });

  it.each([
    [
      "a quickfix code action",
      {
        code_action: {
          file: "src/index.ts",
          range: { start: { line: 1, character: 1 }, end: { line: 1, character: 2 } },
          kind: "quickfix",
        },
      },
      'operation.code_action.kind must be "refactor" or start with "refactor.".',
    ],
    [
      "a range that ends before it starts",
      {
        code_action: {
          file: "src/index.ts",
          range: { start: { line: 1, character: 3 }, end: { line: 1, character: 2 } },
          kind: "refactor",
        },
      },
      "operation.code_action.range.end must not be before operation.code_action.range.start.",
    ],
    [
      "a refactor kind as a source action",
      { source_action: { file: "src/index.ts", kind: "refactor.extract" } },
      'operation.source_action.kind must be "source" or start with "source.".',
    ],
    [
      "a missing file",
      { source_action: { file: "src/missing.ts", kind: "source" } },
      "File not found: `src/missing.ts`",
    ],
    [
      "a directory",
      { source_action: { file: "src", kind: "source" } },
      "operation.source_action.file must be a file, not a directory: `src`.",
    ],
    [
      "a removed operation",
      { update_imports: {} },
      "operation contains unsupported field: `update_imports`.",
    ],
  ] satisfies ReadonlyArray<[string, unknown, string]>)(
    "rejects %s before calling the provider",
    async (_label, operation, message) => {
      const requests: RefactorRequest[] = [];
      const outcome = await runRefactorPlanWorkflow(
        { operation } as RefactorPlanWorkflowInput,
        depsWith(new TestCapabilityAdapter({ semantic: deleteFirstLineProvider(requests) })),
      );

      expect(outcome).toEqual({ kind: "invalid-input", message });
      expect(requests).toEqual([]);
    },
  );

  it.each([null, 1])(
    "rejects changed content before storing a version %s rename plan",
    async (version) => {
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
      let stored = false;
      const deps: RefactorWorkflowDeps = {
        cwd,
        capability: new TestCapabilityAdapter({
          semantic: createLspSemanticProvider({
            getOpenDocumentVersion: () => 1,
            rename: async () => {
              const file = path.join(cwd, "src", "index.ts");
              const fingerprint = createHash("sha256").update("oldName();\n").digest("hex");
              // An external writer changes disk after the request snapshot, without a client sync.
              writeFileSync(file, "\noldName();\n");
              return {
                authorizedMutationRoots: [cwd],
                documentSnapshots: [
                  {
                    file,
                    version: 1,
                    contentFingerprint: fingerprint,
                    diskContentFingerprint: fingerprint,
                  },
                ],
                value: {
                  documentChanges: [
                    {
                      textDocument: { uri: pathToFileURL(file).href, version },
                      edits: [
                        {
                          range: {
                            start: { line: 0, character: 0 },
                            end: { line: 0, character: 7 },
                          },
                          newText: "newName",
                        },
                      ],
                    },
                  ],
                },
              };
            },
          } as unknown as WorkspaceLspRuntime),
        }),
        lookupTargetId: (targetId) => getWorkflowTarget(store, targetId),
        registerTarget: (input) => registerWorkflowTarget(store, cwd, input),
        storePlan: () => {
          stored = true;
          return "plan-id";
        },
        getPlan: () => undefined,
        removePlan: () => undefined,
      };

      const outcome = await runRefactorPlanWorkflow(
        {
          operation: {
            rename_symbol: { target: { handle: entry.targetId }, newName: "newName" },
          },
        },
        deps,
      );

      expect(outcome).toMatchObject({
        kind: "unavailable",
        reason:
          "File src/index.ts changed after the semantic input snapshot. Request a new rename plan.",
      });
      expect(stored).toBe(false);
    },
  );

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
        operation: {
          rename_symbol: { target: { handle: entry.targetId }, newName: "newName" },
        },
      },
      deps,
    );

    expect(outcome).toEqual({
      kind: "unavailable",
      reason: "Semantic provider did not become ready within the wait window; retry shortly.",
    });
  });
});
