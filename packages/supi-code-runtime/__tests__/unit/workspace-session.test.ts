import { describe, expect, it } from "vitest";
import type { ProviderAvailability } from "../../src/api.ts";
import { createWorkspaceContext, type WorkspaceContext } from "../../src/api.ts";

describe("WorkspaceContext", () => {
  it("type-checks the interface", () => {
    const ctx: WorkspaceContext = {
      cwd: "/test",
      model: null,
      semantic: { state: { kind: "unavailable", reason: "no LSP" }, provider: null },
      structural: { state: { kind: "unavailable", reason: "no tree-sitter" }, provider: null },
    };
    expect(ctx.cwd).toBe("/test");
    expect(ctx.semantic.state.kind).toBe("unavailable");
    expect(ctx.structural.provider).toBeNull();
  });

  it("supports all ProviderAvailability kinds", () => {
    const states: ProviderAvailability[] = [
      { kind: "pending" },
      { kind: "ready" },
      { kind: "disabled" },
      { kind: "inactive" },
      { kind: "unavailable", reason: "stopped" },
    ];
    for (const state of states) {
      if (state.kind === "unavailable") {
        expect(state.reason).toBeDefined();
      }
    }
    expect(states).toHaveLength(5);
  });
});

describe("createWorkspaceContext", () => {
  it("returns a context for the given cwd", () => {
    const ctx = createWorkspaceContext("/project");
    expect(ctx.cwd).toBe("/project");
  });

  it("starts with both providers unavailable", () => {
    const ctx = createWorkspaceContext("/project");
    expect(ctx.semantic.state.kind).toBe("unavailable");
    expect(ctx.structural.state.kind).toBe("unavailable");
    expect(ctx.semantic.provider).toBeNull();
    expect(ctx.structural.provider).toBeNull();
  });
});
