import { describe, expect, it, vi } from "vitest";
import { createDiagnosticStore } from "../../src/manager/diagnostic-store.ts";
import type { LspManager } from "../../src/manager/manager.ts";

describe("diagnostic-store", () => {
  const makeManager = () =>
    ({
      getDiagnosticSummary: vi.fn().mockReturnValue([]),
      getOutstandingDiagnostics: vi.fn().mockReturnValue([]),
      getOutstandingDiagnosticSummary: vi.fn().mockReturnValue([]),
      syncFileAndGetDiagnostics: vi.fn().mockResolvedValue(null),
    }) as unknown as LspManager;

  it("creates a DiagnosticStore from a mock LspManager", () => {
    const manager = makeManager();
    const store = createDiagnosticStore(manager);
    expect(typeof store.getDiagnosticSummary).toBe("function");
    expect(typeof store.getOutstandingDiagnostics).toBe("function");
    expect(typeof store.syncAndGetDiagnostics).toBe("function");
  });

  it("delegates getDiagnosticSummary", () => {
    const manager = makeManager();
    const store = createDiagnosticStore(manager);
    store.getDiagnosticSummary();
    expect(manager.getDiagnosticSummary).toHaveBeenCalled();
  });

  it("delegates syncAndGetDiagnostics", async () => {
    const manager = makeManager();
    const store = createDiagnosticStore(manager);
    await store.syncAndGetDiagnostics("test.ts", 4);
    expect(manager.syncFileAndGetDiagnostics).toHaveBeenCalledWith("test.ts", 4);
  });
});
