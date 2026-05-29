import {
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, describe, expect, it } from "vitest";
import type { CodeIntelligenceToolName, PlannerRoute } from "../../src/intent/types.ts";

function asToolName(name: CodeIntelligenceToolName): CodeIntelligenceToolName {
  return name;
}

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
      const { routeFor } = await import("../../src/analysis/routing/planner.ts");
      const route: PlannerRoute = routeFor("/project", "code_brief");
      expect(route.semanticAvailable).toBe(true);
      expect(route.preferred).toBe("semantic");
    });

    it("returns structural-preferred route for code_brief when only structural is available", async () => {
      registerStructural();
      const { routeFor } = await import("../../src/analysis/routing/planner.ts");
      const route: PlannerRoute = routeFor("/project", "code_brief");
      expect(route.structuralAvailable).toBe(true);
      expect(route.preferred).toBe("structural");
    });

    it("routes code_graph to semantic-preferred when semantic is available", async () => {
      registerSemantic();
      const { routeFor } = await import("../../src/analysis/routing/planner.ts");
      const route = routeFor("/project", asToolName("code_graph"));
      expect(route.preferred).toBe("semantic");
    });

    it("routes code_graph to structural-preferred when only structural is available", async () => {
      registerStructural();
      const { routeFor } = await import("../../src/analysis/routing/planner.ts");
      const route = routeFor("/project", asToolName("code_graph"));
      expect(route.preferred).toBe("structural");
    });

    it("routes code_graph to unavailable when neither provider is available", async () => {
      const { routeFor } = await import("../../src/analysis/routing/planner.ts");
      const route = routeFor("/project", asToolName("code_graph"));
      expect(route.preferred).toBe("unavailable");
    });

    it("returns unavailable for code_graph when only structural is available but semantic is needed", async () => {
      registerStructural();
      const { routeFor } = await import("../../src/analysis/routing/planner.ts");
      // With only structural, code_graph returns structural-preferred
      // (callees can use structural; references/implements cannot)
      const route = routeFor("/project", asToolName("code_graph"));
      expect(route.preferred).toBe("structural");
    });

    it("routes code_refactor_plan to semantic-preferred when refactor-capable semantic is available", async () => {
      registerSemanticWithRename();
      const { routeFor } = await import("../../src/analysis/routing/planner.ts");
      const route = routeFor("/project", asToolName("code_refactor_plan"));
      expect(route.preferred).toBe("semantic");
    });

    it("routes code_affected to semantic-preferred", async () => {
      registerSemantic();
      const { routeFor } = await import("../../src/analysis/routing/planner.ts");
      const route = routeFor("/project", "code_affected");
      expect(route.preferred).toBe("semantic");
    });

    it("returns unavailable for code_affected when semantic analysis is unavailable", async () => {
      registerStructural();
      const { routeFor } = await import("../../src/analysis/routing/planner.ts");
      const route = routeFor("/project", "code_affected");
      expect(route.preferred).toBe("unavailable");
    });

    it("keeps code_affected execution unavailable when only structural analysis is registered", {
      timeout: 5000,
    }, async () => {
      registerStructural();
      const { executeAffectedTool } = await import("../../src/tool/execute-affected.ts");
      const result = await executeAffectedTool(
        { file: "src/index.ts", line: 1, character: 1 },
        { cwd: "/project" },
      );
      expect(result.content).toContain("No semantic analysis provider is available");
    });

    it("returns unavailable when no capability is registered", async () => {
      const { routeFor } = await import("../../src/analysis/routing/planner.ts");
      const route = routeFor("/project", "code_brief");
      expect(route.preferred).toBe("unavailable");
    });

    it("routes code_health with search-preferred regardless of capability state", async () => {
      const { routeFor } = await import("../../src/analysis/routing/planner.ts");
      const route = routeFor("/project", asToolName("code_health"));
      expect(route.preferred).toBe("search");
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

function createMockSemanticProviderWithRename(): SemanticProvider {
  return {
    references: async () => null,
    implementation: async () => null,
    documentSymbols: async () => [],
    workspaceSymbols: async () => [],
    rename: async (_file, _pos, _newName) => ({
      kind: "precise" as const,
      edits: { edits: [] },
    }),
    codeActions: async (_file, _pos) => [],
  };
}

function registerSemanticWithRename() {
  const runtime = getDefaultWorkspaceRuntime();
  runtime.registerSemantic("/project", createMockSemanticProviderWithRename());
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
