import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function createProjectFile(content: string): { projectDir: string; file: string } {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-refactor-ops-"));
  const projectDir = path.join(tmpDir, "project");
  const file = path.join(projectDir, "src", "index.ts");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf-8");
  return { projectDir, file };
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

function extractPlanId(content: string): string {
  const match = content.match(/\*\*Plan ID:\*\* `([^`]+)`/);
  if (!match) {
    throw new Error(`Plan ID not found in content:\n${content}`);
  }
  return match[1];
}

describe("code_refactor_plan → code_refactor_apply for non-rename operations", () => {
  it("plans and applies update_imports through the generic refactor path", async () => {
    const { projectDir, file } = createProjectFile(
      'import { unused } from "./dep";\nconst used = 1;\n',
    );
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
      projectDir,
      createSemanticProvider({
        refactor: async (request) => {
          expect(request.operation).toBe("update_imports");
          return {
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
          };
        },
      }),
    );

    const planResult = await executeAction(
      {
        action: "refactor_plan",
        operation: "update_imports",
        file: "src/index.ts",
        line: 1,
        character: 1,
      } as unknown as ActionParams,
      { cwd: projectDir },
    );

    expect(planResult.content).toContain("Plan ID");
    expect(planResult.content).toContain("update_imports");

    const applyResult = await executeAction(
      {
        action: "refactor_apply",
        planId: extractPlanId(planResult.content),
      } as unknown as ActionParams,
      { cwd: projectDir },
    );

    expect(applyResult.content).toContain("applied");
    expect(readFileSync(file, "utf-8")).toBe("const used = 1;\n");
  });

  it("plans and applies delete_dead_code through the generic refactor path", async () => {
    const { projectDir, file } = createProjectFile("const unused = 1;\nconst used = 2;\n");
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
      projectDir,
      createSemanticProvider({
        refactor: async (request) => {
          expect(request.operation).toBe("delete_dead_code");
          return {
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
          };
        },
      }),
    );

    const planResult = await executeAction(
      {
        action: "refactor_plan",
        operation: "delete_dead_code",
        file: "src/index.ts",
        line: 1,
        character: 1,
      } as unknown as ActionParams,
      { cwd: projectDir },
    );

    expect(planResult.content).toContain("Plan ID");
    expect(planResult.content).toContain("delete_dead_code");

    const applyResult = await executeAction(
      {
        action: "refactor_apply",
        planId: extractPlanId(planResult.content),
      } as unknown as ActionParams,
      { cwd: projectDir },
    );

    expect(applyResult.content).toContain("applied");
    expect(readFileSync(file, "utf-8")).toBe("const used = 2;\n");
  });
});

describe("unsupported file operations still validate anchored params first", () => {
  it("reports a missing file before returning rename_file unavailable", async () => {
    const { projectDir } = createProjectFile("export const x = 1;\n");

    const result = await executeAction(
      {
        action: "refactor_plan",
        operation: "rename_file",
        newName: "src/renamed.ts",
      } as unknown as ActionParams,
      { cwd: projectDir },
    );

    expect(result.content).toContain("requires a `file`");
    expect(result.content).not.toContain("File/resource operations are deferred");
  });

  it("reports missing line/character before returning move_file unavailable", async () => {
    const { projectDir } = createProjectFile("export const x = 1;\n");

    const result = await executeAction(
      {
        action: "refactor_plan",
        operation: "move_file",
        file: "src/index.ts",
        destination: "src/moved.ts",
      } as unknown as ActionParams,
      { cwd: projectDir },
    );

    expect(result.content).toContain("requires `line` and `character`");
    expect(result.content).not.toContain("File/resource operations are deferred");
  });
});
