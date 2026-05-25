import { describe, expect, it } from "vitest";
import { createWorkspaceContext, type WorkspaceContext } from "../../src/api.ts";

describe("WorkspaceContext with model", () => {
  it("supports an optional project model", () => {
    const ctx: WorkspaceContext = {
      cwd: "/project",
      model: null,
      semantic: { state: { kind: "unavailable", reason: "no LSP" }, provider: null },
      structural: { state: { kind: "unavailable", reason: "no tree-sitter" }, provider: null },
    };
    expect(ctx.model).toBeNull();
  });

  it("createWorkspaceContext returns model as null initially", () => {
    const ctx = createWorkspaceContext("/project");
    expect(ctx.model).toBeNull();
    expect(ctx.cwd).toBe("/project");
  });
});
