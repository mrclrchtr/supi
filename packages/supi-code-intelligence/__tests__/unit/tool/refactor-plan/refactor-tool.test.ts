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

  it("routes code_refactor_plan to semantic-preferred when refactor-capable provider is registered", async () => {
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic(
      "/project",
      createSemanticProvider(async () => ({ kind: "precise", edits: { edits: [] } })),
    );

    const { routeFor } = await import("../../../../src/analysis/target/planner.ts");
    const route = routeFor("/project", "code_refactor_plan");
    expect(route.preferred).toBe("semantic");
    expect(route.refactorAvailable).toBe(true);
  });

  it("routes code_refactor_plan to unavailable when no refactor-capable provider exists", async () => {
    const { routeFor } = await import("../../../../src/analysis/target/planner.ts");
    expect(routeFor("/project", "code_refactor_plan").preferred).toBe("unavailable");
    expect(routeFor("/project", "code_refactor_plan").refactorAvailable).toBe(false);
  });

  it("routes code_refactor_apply to semantic-preferred", async () => {
    const { routeFor } = await import("../../../../src/analysis/target/planner.ts");
    expect(routeFor("/project", "code_refactor_apply").preferred).toBe("semantic");
  });
});
