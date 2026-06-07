import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getDefaultWorkspaceRuntime,
  type RefactorResult,
  type SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, describe, expect, it } from "vitest";
import { type ActionParams, executeAction } from "../helpers/execute-action.ts";

let tmpDir: string | null = null;

afterEach(() => {
  getDefaultWorkspaceRuntime().clearAll();
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

function createProjectFile(content = "oldName();\n"): { projectDir: string; file: string } {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-refactor-red-"));
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
  newName?: string;
  destination?: string;
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

describe("code_refactor_plan", () => {
  it("routes to semantic-preferred when refactor-capable provider is registered", async () => {
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
      "/project",
      createSemanticProvider({
        rename: async () => ({ kind: "precise", edits: { edits: [] } }),
      }),
    );

    const { routeFor } = await import("../../src/analysis/routing/planner.ts");
    const route = routeFor("/project", "code_refactor_plan");
    expect(route.preferred).toBe("semantic");
    expect(route.refactorAvailable).toBe(true);
  });

  it("returns a rename_symbol plan result without mutating files", async () => {
    const { projectDir, file } = createProjectFile();
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
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

    const result = await executeAction(
      {
        action: "refactor_plan",
        operation: "rename_symbol",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
      } as unknown as ActionParams,
      { cwd: projectDir },
    );

    expect(result.content).toContain("Plan ID");
    expect(result.content).toContain("rename_symbol");
    expect(result.content).toContain("`src/index.ts`");
    expect(result.content).not.toContain(projectDir);
  });

  it("canonicalizes the legacy rename alias to rename_symbol in the preview", async () => {
    const { projectDir, file } = createProjectFile();
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
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

    const result = await executeAction(
      {
        action: "refactor_plan",
        operation: "rename",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
      } as unknown as ActionParams,
      { cwd: projectDir },
    );

    expect(result.content).toContain("rename_symbol");
    expect(result.content).not.toContain("Refactor Plan: rename `");
  });

  it("does not mutate files during planning", async () => {
    const { projectDir, file } = createProjectFile("oldName();\n");
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
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

    const result = await executeAction(
      {
        action: "refactor_plan",
        operation: "rename_symbol",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
      } as unknown as ActionParams,
      { cwd: projectDir },
    );

    const { readFileSync } = await import("node:fs");
    expect(readFileSync(file, "utf-8")).toBe("oldName();\n");
    expect(result.content).toContain("Plan ID");
  });
});

describe("code_refactor_apply", () => {
  it("rejects missing plan ids", async () => {
    const { projectDir } = createProjectFile();
    const result = await executeAction({ action: "refactor_apply" } as unknown as ActionParams, {
      cwd: projectDir,
    });

    expect(result.content).toContain("planId");
  });

  it("rejects nonexistent plan ids", async () => {
    const { projectDir } = createProjectFile();
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
      projectDir,
      createSemanticProvider({
        rename: async () => ({ kind: "precise", edits: { edits: [] } }),
      }),
    );
    const result = await executeAction(
      { action: "refactor_apply", planId: "nonexistent-plan" } as unknown as ActionParams,
      { cwd: projectDir },
    );

    expect(result.content).toContain("not found");
  });

  it("applies a valid rename alias plan and reports files changed", async () => {
    const { projectDir, file } = createProjectFile("oldName();\n");
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
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

    const planResult = await executeAction(
      {
        action: "refactor_plan",
        operation: "rename",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
      } as unknown as ActionParams,
      { cwd: projectDir },
    );
    expect(planResult.content).toContain("Plan ID");

    const result = await executeAction(
      {
        action: "refactor_apply",
        planId: extractPlanId(planResult.content),
      } as unknown as ActionParams,
      { cwd: projectDir },
    );

    expect(result.content).toContain("applied");
    expect(result.content).toContain("1");
  });
});
