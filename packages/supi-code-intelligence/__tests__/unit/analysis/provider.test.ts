import {
  completedCodeQuery,
  getDefaultWorkspaceRuntime,
  type SemanticProvider,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { beforeEach, describe, expect, it } from "vitest";
import { getCodeProvider } from "../../../src/analysis/provider.ts";
import { clearMockRuntime, registerMockProvider } from "../../helpers/register-mock-runtime.ts";

describe("request-context", () => {
  beforeEach(() => {
    clearMockRuntime();
  });

  it("returns unavailable for unknown cwd", () => {
    const state = getCodeProvider("/unknown");
    expect(state.kind).toBe("unavailable");
    if (state.kind === "unavailable") {
      expect(state.reason).toContain("No code provider initialized");
    }
  });

  it("returns ready when semantic capability is registered", () => {
    registerMockProvider("/project", {
      references: async () =>
        completedCodeQuery([
          {
            uri: "file:///a.ts",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          },
        ]),
    });

    const state = getCodeProvider("/project");
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") {
      expect(typeof state.provider.references).toBe("function");
    }
  });

  it("returns ready when semantic capability is pending but a provider is registered", () => {
    const noopSemantic: SemanticProvider = {
      references: async () => completedCodeQuery([]),
      implementation: async () => unavailableCodeQuery("not configured"),
      documentSymbols: async () => unavailableCodeQuery("not configured"),
      workspaceSymbols: async () => unavailableCodeQuery("not configured"),
    };
    getDefaultWorkspaceRuntime().registerSemanticPending("/project", noopSemantic);

    const state = getCodeProvider("/project");
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") {
      expect(typeof state.provider.references).toBe("function");
    }
  });

  it("returns ready when structural capability is registered", () => {
    registerMockProvider("/project", {
      outline: async () => ({ kind: "success" as const, data: [] }),
    });

    const state = getCodeProvider("/project");
    expect(state.kind).toBe("ready");
  });

  it("semantic methods return unavailable when only structural is available", async () => {
    registerMockProvider("/project", {
      outline: async () => ({ kind: "success" as const, data: [] }),
    });

    const state = getCodeProvider("/project");
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") {
      const result = await state.provider.references("test.ts", { line: 0, character: 0 });
      expect(result.kind).toBe("unavailable");
    }
  });

  it("structural methods return unavailable when only semantic is available", async () => {
    // Register only semantic via runtime API directly
    const noopSemantic: SemanticProvider = {
      references: async () => completedCodeQuery([]),
      implementation: async () => unavailableCodeQuery("not configured"),
      documentSymbols: async () => unavailableCodeQuery("not configured"),
      workspaceSymbols: async () => unavailableCodeQuery("not configured"),
    };
    getDefaultWorkspaceRuntime().registerSemantic("/project", noopSemantic);

    const state = getCodeProvider("/project");
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") {
      const result = await state.provider.outline("test.ts");
      expect(result.kind).toBe("unavailable");
    }
  });

  it("reflects cleared workspace as unavailable", () => {
    registerMockProvider("/project");
    getDefaultWorkspaceRuntime().clearWorkspace("/project");

    const state = getCodeProvider("/project");
    expect(state.kind).toBe("unavailable");
  });
});
