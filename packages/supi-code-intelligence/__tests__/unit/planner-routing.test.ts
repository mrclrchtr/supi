import {
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, describe, expect, it } from "vitest";
import type { PlannerRoute } from "../../src/intent/types.ts";

describe("Planner routing", () => {
  afterEach(() => {
    getDefaultWorkspaceRuntime().clearAll();
  });

  function registerSemantic() {
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerSemantic("/project", createMockSemanticProvider());
  }

  function registerStructural() {
    const runtime = getDefaultWorkspaceRuntime();
    runtime.registerStructural("/project", createMockStructuralProvider());
  }

  describe("routeFor", () => {
    it("returns semantic-preferred route for code_brief when semantic is available", async () => {
      registerSemantic();
      const { routeFor } = await import("../../src/planner/planner.ts");
      const route: PlannerRoute = routeFor("/project", "code_brief");
      expect(route.semanticAvailable).toBe(true);
      expect(route.preferred).toBe("semantic");
    });

    it("returns structural-preferred route for code_brief when only structural is available", async () => {
      registerStructural();
      const { routeFor } = await import("../../src/planner/planner.ts");
      const route: PlannerRoute = routeFor("/project", "code_brief");
      expect(route.structuralAvailable).toBe(true);
      expect(route.preferred).toBe("structural");
    });

    it("routes code_relations callers to semantic-preferred", async () => {
      registerSemantic();
      const { routeFor } = await import("../../src/planner/planner.ts");
      const route = routeFor("/project", "code_relations", "callers");
      expect(route.preferred).toBe("semantic");
    });

    it("routes code_relations callees to structural-preferred", async () => {
      registerStructural();
      const { routeFor } = await import("../../src/planner/planner.ts");
      const route = routeFor("/project", "code_relations", "callees");
      expect(route.preferred).toBe("structural");
    });

    it("routes code_relations implementations to semantic-preferred", async () => {
      registerSemantic();
      const { routeFor } = await import("../../src/planner/planner.ts");
      const route = routeFor("/project", "code_relations", "implementations");
      expect(route.preferred).toBe("semantic");
    });

    it("returns unavailable for semantic-only relations when only structural is available", async () => {
      registerStructural();
      const { routeFor } = await import("../../src/planner/planner.ts");
      expect(routeFor("/project", "code_relations", "callers").preferred).toBe("unavailable");
      expect(routeFor("/project", "code_relations", "implementations").preferred).toBe(
        "unavailable",
      );
    });

    it("returns unavailable for structural-only callees when only semantic is available", async () => {
      registerSemantic();
      const { routeFor } = await import("../../src/planner/planner.ts");
      expect(routeFor("/project", "code_relations", "callees").preferred).toBe("unavailable");
    });

    it("routes code_affected to semantic-preferred", async () => {
      registerSemantic();
      const { routeFor } = await import("../../src/planner/planner.ts");
      const route = routeFor("/project", "code_affected");
      expect(route.preferred).toBe("semantic");
    });

    it("returns unavailable for code_affected when semantic analysis is unavailable", async () => {
      registerStructural();
      const { routeFor } = await import("../../src/planner/planner.ts");
      const route = routeFor("/project", "code_affected");
      expect(route.preferred).toBe("unavailable");
    });

    it("keeps code_affected execution unavailable when only structural analysis is registered", async () => {
      registerStructural();
      const { executeAffectedTool } = await import("../../src/tool/execute-affected.ts");
      const result = await executeAffectedTool(
        { file: "src/index.ts", line: 1, character: 1 },
        { cwd: "/project" },
      );
      expect(result.content).toContain("No semantic analysis provider is available");
    });

    it("routes code_pattern to search-preferred regardless of capability state", async () => {
      const { routeFor } = await import("../../src/planner/planner.ts");
      const route = routeFor("/project", "code_pattern");
      expect(route.preferred).toBe("search");
    });

    it("returns unavailable when no capability is registered", async () => {
      const { routeFor } = await import("../../src/planner/planner.ts");
      const route = routeFor("/project", "code_brief");
      expect(route.preferred).toBe("unavailable");
    });
  });
});

function createMockSemanticProvider(): SemanticProvider {
  return {
    references: async () => null,
    implementation: async () => null,
    documentSymbols: async () => [],
    workspaceSymbols: async () => [],
  };
}

function createMockStructuralProvider(): StructuralProvider {
  return {
    calleesAt: async (_f, _l, _c) => ({
      kind: "unsupported-language" as const,
      file: "x",
      message: "mock",
    }),
    exports: async (_f) => ({ kind: "unsupported-language" as const, file: "x", message: "mock" }),
    outline: async (_f) => ({ kind: "unsupported-language" as const, file: "x", message: "mock" }),
    imports: async (_f) => ({ kind: "unsupported-language" as const, file: "x", message: "mock" }),
    nodeAt: async (_f, _l, _c) => ({
      kind: "unsupported-language" as const,
      file: "x",
      message: "mock",
    }),
  };
}
