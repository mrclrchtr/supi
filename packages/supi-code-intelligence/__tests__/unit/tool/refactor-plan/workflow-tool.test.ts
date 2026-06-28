import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getDefaultWorkspaceRuntime,
  type RefactorResult,
  type SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../../../src/extension.ts";
import { executeRefactorApplyTool } from "../../../../src/tool/refactor-apply/execute.ts";
import { executeRefactorPlanTool } from "../../../../src/tool/refactor-plan/execute.ts";
import { sessionCache } from "../../../helpers/execute-action.ts";

let tmpDir: string | null = null;

afterEach(() => {
  getDefaultWorkspaceRuntime().clearAll();
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

type RefactorRequest = {
  operation: string;
  file: string;
  position: { line: number; character: number };
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newName?: string;
};

type OperationAwareSemanticProvider = SemanticProvider & {
  refactor?: (request: RefactorRequest) => Promise<RefactorResult>;
};

function createSemanticProvider(
  overrides: Partial<Pick<SemanticProvider, "rename">> & {
    refactor?: OperationAwareSemanticProvider["refactor"];
  } = {},
): SemanticProvider {
  return {
    references: async () => null,
    implementation: async () => null,
    documentSymbols: async () => [],
    workspaceSymbols: async () => [],
    rename: overrides.rename,
    ...(overrides.refactor ? { refactor: overrides.refactor } : {}),
  } as SemanticProvider;
}

describe("code_refactor_plan / code_refactor_apply workflow wrappers", () => {
  it("registers and executes code_refactor_plan as the pure planner", async () => {
    const { projectDir, file } = createProjectFile();
    getDefaultWorkspaceRuntime().registerSemantic(
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
        }),
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_refactor_plan");

    const result = (await tool.execute(
      "workflow-refactor-1",
      {
        operation: "rename_symbol",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
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

  it("creates extract function plans when the semantic provider returns precise edits", async () => {
    const { projectDir, file } = createProjectFile("const value = 1 + 2;\n");
    getDefaultWorkspaceRuntime().registerSemantic(
      projectDir,
      createSemanticProvider({
        refactor: async (request) => {
          expect(request.operation).toBe("extract_function");
          expect(request.newName).toBe("computeValue");
          expect(request.range).toEqual({
            start: { line: 0, character: 14 },
            end: { line: 0, character: 19 },
          });
          return {
            kind: "precise",
            edits: {
              edits: [
                {
                  file,
                  range: { start: { line: 0, character: 14 }, end: { line: 0, character: 19 } },
                  newText: "computeValue()",
                },
              ],
            },
          };
        },
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_refactor_plan");

    const result = (await tool.execute(
      "workflow-refactor-extract-function",
      {
        operation: "extract_function",
        file: "src/index.ts",
        range: { start: { line: 1, character: 15 }, end: { line: 1, character: 20 } },
        newName: "computeValue",
      },
      undefined,
      undefined,
      makeCtx({ cwd: projectDir }),
    )) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain("Plan ID");
    expect(result.content[0].text).toContain("extract_function");
  });

  it("discloses truncated refactor edit previews in markdown and details", async () => {
    const { projectDir, file } = createProjectFile();
    getDefaultWorkspaceRuntime().registerSemantic(
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
        }),
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_refactor_plan");

    const result = (await tool.execute(
      "workflow-refactor-truncated-preview",
      {
        operation: "rename_symbol",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
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

  it("accepts the legacy rename alias on code_refactor_plan and canonicalizes it", async () => {
    const { projectDir, file } = createProjectFile();
    getDefaultWorkspaceRuntime().registerSemantic(
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
        }),
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);
    const tool = getTool(pi, "code_refactor_plan");

    const result = (await tool.execute(
      "workflow-refactor-rename-alias",
      {
        operation: "rename",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
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
    getDefaultWorkspaceRuntime().registerSemantic(
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
        }),
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);

    const refactorTool = getTool(pi, "code_refactor_plan");
    const planResult = (await refactorTool.execute(
      "workflow-refactor-2",
      {
        operation: "rename_symbol",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
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
    )) as { content: Array<{ type: string; text: string }> };

    expect(applyResult.content[0].text).toContain("applied");
    expect(readFileSync(file, "utf-8")).toBe("newName();\n");
  });

  it("applies a plan generated by code_refactor_plan via code_refactor_apply", async () => {
    const { projectDir, file } = createProjectFile();
    getDefaultWorkspaceRuntime().registerSemantic(
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
        }),
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);

    const planResult = await executeRefactorPlanTool(
      {
        operation: "rename",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
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
    getDefaultWorkspaceRuntime().registerSemantic(
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
        }),
      }),
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never, sessionCache.getOrCreate);

    const refactorTool = getTool(pi, "code_refactor_plan");
    const planResult = (await refactorTool.execute(
      "workflow-cross-compat-3",
      {
        operation: "rename_symbol",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
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
