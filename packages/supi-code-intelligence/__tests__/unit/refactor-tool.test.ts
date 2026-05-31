/**
 * Routing tests for the workflow refactor surfaces and their compatibility aliases.
 */

import {
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, describe, expect, it } from "vitest";

describe("refactor workflow routing", () => {
  afterEach(() => {
    getDefaultWorkspaceRuntime().clearAll();
  });

  function createSemanticProvider(rename: SemanticProvider["rename"]): SemanticProvider {
    return {
      references: async () => null,
      implementation: async () => null,
      documentSymbols: async () => [],
      workspaceSymbols: async () => [],
      rename,
    };
  }

  it("routes code_refactor and code_refactor_plan to semantic-preferred when refactor-capable provider is registered", async () => {
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
      "/project",
      createSemanticProvider(async () => ({ kind: "precise", edits: { edits: [] } })),
    );

    const { routeFor } = await import("../../src/analysis/routing/planner.ts");
    const workflowRoute = routeFor("/project", "code_refactor");
    expect(workflowRoute.preferred).toBe("semantic");
    expect(workflowRoute.refactorAvailable).toBe(true);

    const compatibilityRoute = routeFor("/project", "code_refactor_plan");
    expect(compatibilityRoute.preferred).toBe("semantic");
    expect(compatibilityRoute.refactorAvailable).toBe(true);
  });

  it("routes code_refactor and code_refactor_plan to unavailable when no refactor-capable provider exists", async () => {
    const { routeFor } = await import("../../src/analysis/routing/planner.ts");
    expect(routeFor("/project", "code_refactor").preferred).toBe("unavailable");
    expect(routeFor("/project", "code_refactor").refactorAvailable).toBe(false);
    expect(routeFor("/project", "code_refactor_plan").preferred).toBe("unavailable");
    expect(routeFor("/project", "code_refactor_plan").refactorAvailable).toBe(false);
  });

  it("routes code_apply and code_refactor_apply to semantic-preferred", async () => {
    const { routeFor } = await import("../../src/analysis/routing/planner.ts");
    expect(routeFor("/project", "code_apply").preferred).toBe("semantic");
    expect(routeFor("/project", "code_refactor_apply").preferred).toBe("semantic");
  });
});
