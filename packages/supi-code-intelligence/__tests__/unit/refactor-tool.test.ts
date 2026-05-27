/**
 * RED tests for code_refactor_plan routing and behavior.
 *
 * These tests define the new two-step refactor surface.
 * Some will fail until Task 6 implements the real plan executors.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, describe, expect, it } from "vitest";

describe("code_refactor_plan routing", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    getDefaultWorkspaceRuntime().clearAll();
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function _createProjectFile() {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-refactor-plan-route-"));
    const projectDir = path.join(tmpDir, "project");
    const file = path.join(projectDir, "src", "index.ts");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "oldName();\n", "utf-8");
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

  it("routes code_refactor_plan to semantic-preferred when refactor-capable provider is registered", async () => {
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
      "/project",
      createSemanticProvider(async () => ({ kind: "precise", edits: { edits: [] } })),
    );

    const { routeFor } = await import("../../src/planner/planner.ts");
    const route = routeFor("/project", "code_refactor_plan");
    expect(route.preferred).toBe("semantic");
    expect(route.refactorAvailable).toBe(true);
  });

  it("routes code_refactor_plan to unavailable when no refactor-capable provider exists", async () => {
    const { routeFor } = await import("../../src/planner/planner.ts");
    const route = routeFor("/project", "code_refactor_plan");
    expect(route.preferred).toBe("unavailable");
    expect(route.refactorAvailable).toBe(false);
  });

  it("routes code_refactor_apply to semantic-preferred when semantic is available", async () => {
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
      "/project",
      createSemanticProvider(async () => ({ kind: "precise", edits: { edits: [] } })),
    );

    const { routeFor } = await import("../../src/planner/planner.ts");
    const route = routeFor("/project", "code_refactor_apply");
    expect(route.semanticAvailable).toBe(true);
  });
});
