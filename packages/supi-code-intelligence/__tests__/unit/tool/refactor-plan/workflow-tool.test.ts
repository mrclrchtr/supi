import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  completedCodeQuery,
  getDefaultWorkspaceRuntime,
  type RefactorRequest,
  type RefactorResult,
  type SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import {
  clearWorkspaceLspRuntime,
  setWorkspaceLspRuntimeState,
  type WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../../../src/extension.ts";
import { executeRefactorApplyTool } from "../../../../src/tool/code_refactor_apply/execute.ts";
import { executeRefactorPlanTool } from "../../../../src/tool/code_refactor_plan/execute.ts";
import { sessionCache } from "../../../helpers/execute-action.ts";

let tmpDir: string | null = null;
const lspCwds = new Set<string>();

afterEach(() => {
  getDefaultWorkspaceRuntime().clearAll();
  for (const cwd of lspCwds) clearWorkspaceLspRuntime(cwd);
  lspCwds.clear();
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

function createProjectFile(content = "oldName();\n"): { projectDir: string; file: string } {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-refactor-workflow-"));
  const projectDir = path.join(tmpDir, "project");
  const file = path.join(projectDir, "src", "index.ts");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf-8");
  return { projectDir, file };
}

function extractPlanId(content: string): string {
  const match = content.match(/\*\*Plan ID:\*\* `([^`]+)`/);
  if (!match) {
    throw new Error(`Plan ID not found in content:\n${content}`);
  }
  return match[1];
}

function createSemanticProvider(
  overrides: Partial<Pick<SemanticProvider, "rename">> & {
    refactor?: (request: RefactorRequest) => Promise<RefactorResult>;
  } = {},
): SemanticProvider {
  return {
    references: async () => completedCodeQuery([]),
    implementation: async () => completedCodeQuery([]),
    documentSymbols: async (file) =>
      completedCodeQuery([
        {
          name: "oldName",
          kind: "Function",
          file,
          declarationAnchor: { line: 1, character: 1 },
          nameAnchor: { line: 1, character: 1 },
          container: null,
          level: "top-level",
        },
      ]),
    workspaceSymbols: async () => completedCodeQuery([]),
    rename: overrides.rename,
    ...(overrides.refactor ? { refactor: overrides.refactor } : {}),
  } as SemanticProvider;
}

function registerSemantic(cwd: string, provider: SemanticProvider): void {
  getDefaultWorkspaceRuntime().registerSemantic(cwd, provider);
  lspCwds.add(cwd);
  setWorkspaceLspRuntimeState(cwd, {
    kind: "ready",
    runtime: {
      waitUntilReadyForFile: async () => ({ kind: "ready" }),
    } as unknown as WorkspaceLspRuntime,
  });
}

describe("code_refactor_plan / code_refactor_apply workflow wrappers", () => {
  it("registers and executes code_refactor_plan as the pure planner", async () => {
    const { projectDir, file } = createProjectFile();
    registerSemantic(
      projectDir,
      createSemanticProvider({
        rename: async () => ({
          kind: "precise",
          edits: {
            edits: [
              {
                file,
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
                newText: "newName",
              },
            ],
          },
          authorizedMutationRoots: [projectDir],
        }),
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_refactor_plan");

    const result = (await tool.execute(
      "workflow-refactor-1",
      {
        operation: {
          rename_symbol: {
            target: { anchor: { file: "src/index.ts", line: 1, character: 1 } },
            newName: "newName",
          },
        },
      },
      undefined,
      undefined,
      makeCtx({ cwd: projectDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain("Plan ID");
    expect(result.content[0].text).toContain("rename_symbol");
    expect(result.content[0].text).toContain("code_refactor_apply");
    expect(result.content[0].text).not.toContain(projectDir);
  });

  it.each([
    ["edit", "Source: code action edit"],
    [
      "captured-command",
      "Source: edit captured from the server command; it was refused, not applied",
    ],
  ] as const)(
    "plans a code action from a %s and reports its scope, action, source, and generated name",
    async (provenance, sourceLine) => {
      const { projectDir, file } = createProjectFile("const value = 1 + 2;\n");
      const requests: RefactorRequest[] = [];
      registerSemantic(
        projectDir,
        createSemanticProvider({
          refactor: async (request) => {
            requests.push(request);
            return {
              kind: "precise",
              edits: {
                edits: [
                  {
                    file,
                    range: { start: { line: 0, character: 14 }, end: { line: 0, character: 19 } },
                    newText: "newFunction()",
                  },
                ],
              },
              action: { kind: "refactor.extract.function", title: "Extract function", provenance },
              authorizedMutationRoots: [projectDir],
            };
          },
        }),
      );

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);
      const tool = getTool(pi, "code_refactor_plan");

      const result = (await tool.execute(
        "workflow-refactor-code-action",
        {
          operation: {
            code_action: {
              file: "src/index.ts",
              range: { start: { line: 1, character: 15 }, end: { line: 1, character: 20 } },
              kind: "refactor.extract",
            },
          },
        },
        undefined,
        undefined,
        makeCtx({ cwd: projectDir }),
      )) as { content: Array<{ type: string; text: string }>; structuredContent?: unknown };

      expect(requests).toEqual([
        {
          operation: "code_action",
          file,
          range: { start: { line: 0, character: 14 }, end: { line: 0, character: 19 } },
          kind: "refactor.extract",
        },
      ]);
      const text = result.content[0].text;
      expect(text).toContain("**File:** `src/index.ts` L1:15 → L1:20");
      expect(text).toContain("**Action:** Extract function (`refactor.extract.function`)");
      expect(text).toContain(`**${sourceLine.replace(": ", ":** ")}`);
      expect(text).toContain("newFunction()");
      expect(text).toContain("use rename_symbol to rename any server-generated names");
      expect(result.structuredContent).toMatchObject({
        kind: "completed",
        operation: "code_action",
        file: "src/index.ts",
        range: { start: { line: 1, character: 15 }, end: { line: 1, character: 20 } },
        action: { kind: "refactor.extract.function", title: "Extract function", provenance },
      });
    },
  );

  it("returns ambiguous action candidates with titles to pass back", async () => {
    const { projectDir, file } = createProjectFile("import a from 'a';\n");
    registerSemantic(
      projectDir,
      createSemanticProvider({
        refactor: async () => ({
          kind: "ambiguous",
          candidates: [
            {
              description: "Extract into variable",
              kind: "refactor.extract",
              title: "Extract into variable",
              file,
              line: 1,
              character: 1,
            },
            {
              description: "Extract into function",
              kind: "refactor.extract",
              title: "Extract into function",
              file,
              line: 1,
              character: 1,
            },
          ],
        }),
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_refactor_plan");

    const result = (await tool.execute(
      "workflow-refactor-ambiguous",
      {
        operation: {
          code_action: {
            file: "src/index.ts",
            range: { start: { line: 1, character: 1 }, end: { line: 1, character: 7 } },
            kind: "refactor.extract",
          },
        },
      },
      undefined,
      undefined,
      makeCtx({ cwd: projectDir }),
    )) as { content: Array<{ type: string; text: string }>; structuredContent?: unknown };

    const text = result.content[0].text;
    expect(text).toContain('1. `refactor.extract` — "Extract into variable"');
    expect(text).toContain('2. `refactor.extract` — "Extract into function"');
    expect(text).toContain("exact `title`");
    expect(result.structuredContent).toMatchObject({
      kind: "ambiguous",
      candidates: [
        { kind: "refactor.extract", title: "Extract into variable", file: "src/index.ts" },
        { kind: "refactor.extract", title: "Extract into function" },
      ],
    });
  });

  it("plans a whole-file source action", async () => {
    const { projectDir, file } = createProjectFile("import a from 'a';\noldName();\n");
    registerSemantic(
      projectDir,
      createSemanticProvider({
        refactor: async () => ({
          kind: "precise",
          edits: {
            edits: [
              {
                file,
                range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
                newText: "",
              },
            ],
          },
          action: { kind: "source.organizeImports", title: "Organize imports" },
          authorizedMutationRoots: [projectDir],
        }),
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_refactor_plan");

    const result = (await tool.execute(
      "workflow-refactor-source-action",
      { operation: { source_action: { file: "src/index.ts", kind: "source.organizeImports" } } },
      undefined,
      undefined,
      makeCtx({ cwd: projectDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain("**File:** `src/index.ts` (whole file)");
    expect(result.content[0].text).toContain("source_action");
  });

  it("discloses truncated refactor edit previews in markdown and details", async () => {
    const { projectDir, file } = createProjectFile();
    registerSemantic(
      projectDir,
      createSemanticProvider({
        rename: async () => ({
          kind: "precise",
          edits: {
            edits: Array.from({ length: 6 }, (_, index) => ({
              file,
              range: {
                start: { line: index, character: 0 },
                end: { line: index, character: 7 },
              },
              newText: `newName${index}`,
            })),
          },
          authorizedMutationRoots: [projectDir],
        }),
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_refactor_plan");

    const result = (await tool.execute(
      "workflow-refactor-truncated-preview",
      {
        operation: {
          rename_symbol: {
            target: { anchor: { file: "src/index.ts", line: 1, character: 1 } },
            newName: "newName",
          },
        },
      },
      undefined,
      undefined,
      makeCtx({ cwd: projectDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: "search";
        data: {
          omittedCount: number;
          evidenceLists?: Array<{
            key: string;
            totalCount: number | null;
            shownCount: number;
            omittedCount: number | null;
          }>;
        };
      };
    };

    expect(result.content[0].text).toContain("newName0");
    expect(result.content[0].text).not.toContain("newName5");
    expect(result.content[0].text).toContain("_(showing 5 of 6; 1 omitted)_");
    expect(result.details?.data.omittedCount).toBe(1);
    expect(result.details?.data.evidenceLists).toContainEqual({
      key: "refactor.edits",
      totalCount: 6,
      shownCount: 5,
      omittedCount: 1,
      partialReason: null,
    });
  });

  it("accepts the canonical rename_symbol operation", async () => {
    const { projectDir, file } = createProjectFile();
    registerSemantic(
      projectDir,
      createSemanticProvider({
        rename: async () => ({
          kind: "precise",
          edits: {
            edits: [
              {
                file,
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
                newText: "newName",
              },
            ],
          },
          authorizedMutationRoots: [projectDir],
        }),
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_refactor_plan");

    const result = (await tool.execute(
      "workflow-refactor-rename-symbol",
      {
        operation: {
          rename_symbol: {
            target: { anchor: { file: "src/index.ts", line: 1, character: 1 } },
            newName: "newName",
          },
        },
      },
      undefined,
      undefined,
      makeCtx({ cwd: projectDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain("Plan ID");
    expect(result.content[0].text).toContain("rename_symbol");
    expect(result.content[0].text).not.toContain("Unsupported refactor operation");
  });

  it("applies a workflow plan via code_refactor_apply", async () => {
    const { projectDir, file } = createProjectFile();
    registerSemantic(
      projectDir,
      createSemanticProvider({
        rename: async () => ({
          kind: "precise",
          edits: {
            edits: [
              {
                file,
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
                newText: "newName",
              },
            ],
          },
          authorizedMutationRoots: [projectDir],
        }),
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);

    const refactorTool = getTool(pi, "code_refactor_plan");
    const planResult = (await refactorTool.execute(
      "workflow-refactor-2",
      {
        operation: {
          rename_symbol: {
            target: { anchor: { file: "src/index.ts", line: 1, character: 1 } },
            newName: "newName",
          },
        },
      },
      undefined,
      undefined,
      makeCtx({ cwd: projectDir }),
    )) as { content: Array<{ type: string; text: string }> };

    const applyTool = getTool(pi, "code_refactor_apply");
    const applyResult = (await applyTool.execute(
      "workflow-apply-1",
      { planId: extractPlanId(planResult.content[0].text) },
      undefined,
      undefined,
      makeCtx({ cwd: projectDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: { type: "search"; data: { changedFiles?: readonly string[] } };
    };

    expect(applyResult.content[0].text).toContain("applied");
    expect(applyResult.details?.data.changedFiles).toEqual(["src/index.ts"]);
    expect(readFileSync(file, "utf-8")).toBe("newName();\n");
  });

  it("applies a plan generated by code_refactor_plan via code_refactor_apply", async () => {
    const { projectDir, file } = createProjectFile();
    registerSemantic(
      projectDir,
      createSemanticProvider({
        rename: async () => ({
          kind: "precise",
          edits: {
            edits: [
              {
                file,
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
                newText: "newName",
              },
            ],
          },
          authorizedMutationRoots: [projectDir],
        }),
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);

    const planResult = await executeRefactorPlanTool(
      {
        operation: {
          rename_symbol: {
            target: { anchor: { file: "src/index.ts", line: 1, character: 1 } },
            newName: "newName",
          },
        },
      },
      { cwd: projectDir, session: sessionCache.getOrCreate(projectDir) },
    );

    const applyTool = getTool(pi, "code_refactor_apply");
    const applyResult = (await applyTool.execute(
      "workflow-cross-compat-2",
      { planId: extractPlanId(planResult.content) },
      undefined,
      undefined,
      makeCtx({ cwd: projectDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(applyResult.content[0].text).toContain("applied");
    expect(readFileSync(file, "utf-8")).toBe("newName();\n");
  });

  it("applies a plan generated by code_refactor_plan via executeRefactorApplyTool", async () => {
    const { projectDir, file } = createProjectFile();
    registerSemantic(
      projectDir,
      createSemanticProvider({
        rename: async () => ({
          kind: "precise",
          edits: {
            edits: [
              {
                file,
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
                newText: "newName",
              },
            ],
          },
          authorizedMutationRoots: [projectDir],
        }),
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);

    const refactorTool = getTool(pi, "code_refactor_plan");
    const planResult = (await refactorTool.execute(
      "workflow-cross-compat-3",
      {
        operation: {
          rename_symbol: {
            target: { anchor: { file: "src/index.ts", line: 1, character: 1 } },
            newName: "newName",
          },
        },
      },
      undefined,
      undefined,
      makeCtx({ cwd: projectDir }),
    )) as { content: Array<{ type: string; text: string }> };

    const applyResult = await executeRefactorApplyTool(
      { planId: extractPlanId(planResult.content[0].text) },
      { cwd: projectDir, session: sessionCache.getOrCreate(projectDir) },
    );

    expect(applyResult.content).toContain("applied");
    expect(readFileSync(file, "utf-8")).toBe("newName();\n");
  });
});

describe("refactor workflow unavailable reasons", () => {
  it.each([
    [
      "LSP request textDocument/codeAction failed: Semantic input changed while synchronization was running.",
      "LSP request textDocument/codeAction failed: Semantic input changed while synchronization was running. Retry after concurrent edits finish.",
    ],
    ["No semantic provider is active.", "No semantic provider is active."],
  ])("explains how to recover from %j", async (reason, expected) => {
    const { projectDir } = createProjectFile();
    registerSemantic(
      projectDir,
      createSemanticProvider({ refactor: async () => ({ kind: "unavailable", reason }) }),
    );

    await expect(
      executeRefactorPlanTool(
        { operation: { source_action: { file: "src/index.ts", kind: "source.organizeImports" } } },
        { cwd: projectDir, session: sessionCache.getOrCreate(projectDir) } as never,
      ),
    ).rejects.toThrow(new Error(expected));
  });
});
