/**
 * RED tests for two-step refactor plan/apply behavior.
 *
 * These tests will fail until Task 6 implements the real plan/apply executors.
 * They test through the executeAction helper which currently maps to stub responses.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getDefaultWorkspaceRuntime,
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

function createSemanticProvider(rename: SemanticProvider["rename"]): SemanticProvider {
  return {
    references: async () => null,
    implementation: async () => null,
    documentSymbols: async () => [],
    workspaceSymbols: async () => [],
    rename,
  };
}

describe("code_refactor_plan", () => {
  it("routes to semantic-preferred when refactor-capable provider is registered", async () => {
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
      "/project",
      createSemanticProvider(async () => ({ kind: "precise", edits: { edits: [] } })),
    );

    const { routeFor } = await import("../../src/analysis/routing/planner.ts");
    const route = routeFor("/project", "code_refactor_plan");
    expect(route.preferred).toBe("semantic");
    expect(route.refactorAvailable).toBe(true);
  });

  it("returns a plan result without mutating files", async () => {
    const { projectDir, file } = createProjectFile();
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
      projectDir,
      createSemanticProvider(async () => ({
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
      })),
    );

    const result = await executeAction(
      {
        action: "refactor_plan",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
      } as unknown as ActionParams,
      { cwd: projectDir },
    );

    // RED: should fail because the stub returns "not implemented"
    expect(result.content).not.toContain("not implemented");
  });

  it("does not mutate files during planning", async () => {
    const { projectDir, file } = createProjectFile("oldName();\n");
    // Call plan through the stub
    const result = await executeAction(
      {
        action: "refactor_plan",
        file: "src/index.ts",
        line: 1,
        character: 1,
        newName: "newName",
      } as unknown as ActionParams,
      { cwd: projectDir },
    );

    // File should remain unchanged
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(file, "utf-8")).toBe("oldName();\n");

    // RED failure: content says "not implemented" but plan should have more details
    expect(result.content).not.toContain("not implemented");
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
      createSemanticProvider(async () => ({ kind: "precise", edits: { edits: [] } })),
    );
    const result = await executeAction(
      { action: "refactor_apply", planId: "nonexistent-plan" } as unknown as ActionParams,
      { cwd: projectDir },
    );

    expect(result.content).toContain("not found");
  });

  it("applies a valid plan and reports files changed", async () => {
    const { projectDir, file } = createProjectFile("oldName();\n");
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
      projectDir,
      createSemanticProvider(async () => ({
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
      })),
    );

    // First generate a plan
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

    // Extract the planId
    const planIdMatch = planResult.content.match(/"([^"]+)"/);
    expect(planIdMatch).not.toBeNull();
    const planId = planIdMatch?.[1];

    // Now apply the plan
    const result = await executeAction(
      { action: "refactor_apply", planId } as unknown as ActionParams,
      { cwd: projectDir },
    );

    expect(result.content).toContain("applied");
    expect(result.content).toContain("1");
  });
});
