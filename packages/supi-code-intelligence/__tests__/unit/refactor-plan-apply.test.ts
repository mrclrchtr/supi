import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getDefaultWorkspaceRuntime,
  type RefactorResult,
  type SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, describe, expect, it } from "vitest";
import { executeRefactorPlanTool } from "../../src/tool/execute-refactor-plan.ts";
import { executeResolveTool } from "../../src/tool/execute-resolve.ts";
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

describe("code_refactor_plan anchor enforcement (ADR 0003)", () => {
  // A rename is position-strict: fed a declaration anchor (the `export`
  // keyword) LSP/textDocument/rename silently yields empty or wrong edits.
  // When a targetId resolves to a declaration anchor (nameAnchor could not
  // be derived), code_refactor_plan must refuse rename with an observable
  // error instead of producing a (silently wrong) plan.
  it("refuses rename_symbol when the resolved target fell back to a declaration anchor", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "refactor-anchor-"));
    const projectDir = tmpDir;
    const file = path.join(projectDir, "src", "index.ts");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "export function oldName() {}\n", "utf-8");

    // Workspace symbol carries only a declaration anchor (mirrors toCodeSymbol
    // for a SymbolInformation hit). documentSymbols returns null so refine
    // cannot derive a nameAnchor -> the registered anchorKind is "declaration".
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(projectDir, {
      references: async () => null,
      implementation: async () => null,
      documentSymbols: async () => null,
      workspaceSymbols: async () => [
        {
          name: "oldName",
          kind: "Function",
          file,
          declarationAnchor: { line: 1, character: 1 },
          container: null,
        },
      ],
      // A rename that WOULD produce a plan if the check did not fire, making
      // the Red observable: without enforcement, refactor_plan proceeds and the
      // test sees "Plan ID" instead of the refusal.
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
    } as SemanticProvider);

    // Step 1: resolve -> get a targetId whose anchor is the declaration.
    const resolveResult = await executeResolveTool(
      { query: "oldName", kind: "function" },
      { cwd: projectDir },
    );
    const targetId =
      resolveResult.details?.type === "resolve"
        ? resolveResult.details.data.targets[0]?.targetId
        : undefined;
    expect(targetId).toBeDefined();
    if (!targetId) return;

    // Step 2: refactor_plan with that targetId must refuse, not plan.
    const result = await executeRefactorPlanTool(
      { operation: "rename_symbol", targetId, newName: "newName" },
      { cwd: projectDir },
    );

    expect(result.content).toContain("name anchor");
    expect(result.content).not.toContain("Plan ID");
  });
});
