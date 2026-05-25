import { describe, expect, it, vi } from "vitest";
import type { LspManager } from "../../src/manager/manager.ts";
import { createWorkspaceRouter } from "../../src/manager/workspace-router.ts";

describe("workspace-router", () => {
  const makeManager = () =>
    ({
      canServeFile: vi.fn().mockReturnValue(true),
      isSupportedSourceFile: vi.fn().mockReturnValue(true),
      getKnownProjectServers: vi.fn().mockReturnValue([]),
      registerDetectedServers: vi.fn(),
    }) as unknown as LspManager;

  it("creates a WorkspaceRouter from a mock LspManager", () => {
    const manager = makeManager();
    const router = createWorkspaceRouter(manager);
    expect(typeof router.canServeFile).toBe("function");
    expect(typeof router.isSupportedSourceFile).toBe("function");
    expect(typeof router.getProjectServers).toBe("function");
    expect(typeof router.registerDetectedServers).toBe("function");
  });

  it("delegates canServeFile", () => {
    const manager = makeManager();
    const router = createWorkspaceRouter(manager);
    expect(router.canServeFile("/test/file.ts")).toBe(true);
    expect(manager.canServeFile).toHaveBeenCalledWith("/test/file.ts");
  });

  it("delegates registerDetectedServers", () => {
    const manager = makeManager();
    const router = createWorkspaceRouter(manager);
    router.registerDetectedServers([{ language: "typescript", root: "/project" }]);
    expect(manager.registerDetectedServers).toHaveBeenCalled();
  });
});
