import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTreeSitterSession: vi.fn(),
  getSessionTreeSitterService: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-tree-sitter/api", () => ({
  createTreeSitterSession: mocks.createTreeSitterSession,
  getSessionTreeSitterService: mocks.getSessionTreeSitterService,
}));

import { withStructuralSession } from "../../src/providers/structural-provider.ts";

describe("withStructuralSession", () => {
  it("reuses the shared session-scoped service when available", async () => {
    const service = {
      outline: vi.fn().mockResolvedValue({ kind: "success", data: [] }),
    };
    mocks.getSessionTreeSitterService.mockReturnValue({ kind: "ready", service });

    const result = await withStructuralSession("/project", async (session) => {
      await session.outline("src/index.ts");
      return "done";
    });

    expect(result).toBe("done");
    expect(mocks.createTreeSitterSession).not.toHaveBeenCalled();
    expect(service.outline).toHaveBeenCalledWith("src/index.ts");
  });

  it("falls back to a short-lived owned session when no shared service exists", async () => {
    const dispose = vi.fn();
    const session = {
      outline: vi.fn().mockResolvedValue({ kind: "success", data: [] }),
      dispose,
    };
    mocks.getSessionTreeSitterService.mockReturnValue({
      kind: "unavailable",
      reason: "No Tree-sitter session initialized for this workspace",
    });
    mocks.createTreeSitterSession.mockReturnValue(session);

    await withStructuralSession("/project", async (current) => {
      await current.outline("src/index.ts");
    });

    expect(mocks.createTreeSitterSession).toHaveBeenCalledWith("/project");
    expect(session.outline).toHaveBeenCalledWith("src/index.ts");
    expect(dispose).toHaveBeenCalledOnce();
  });
});
