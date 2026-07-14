import { describe, expect, it, vi } from "vitest";
import { createClientPool } from "../../src/manager/client-pool.ts";
import type { LspManager } from "../../src/manager/manager.ts";

describe("client-pool", () => {
  it("creates a ClientPool from a mock LspManager", () => {
    const manager = {
      ensureFileOpen: vi.fn().mockResolvedValue(null),
      shutdownAll: vi.fn().mockResolvedValue(undefined),
    } as unknown as LspManager;

    const pool = createClientPool(manager);
    expect(typeof pool.trackFile).toBe("function");
    expect(typeof pool.shutdownAll).toBe("function");
  });

  it("tracks a file without exposing the routed client", async () => {
    const manager = {
      ensureFileOpen: vi.fn().mockResolvedValue({}),
      shutdownAll: vi.fn().mockResolvedValue(undefined),
    } as unknown as LspManager;

    const pool = createClientPool(manager);
    const result = await pool.trackFile("/test/file.ts");
    expect(manager.ensureFileOpen).toHaveBeenCalledWith("/test/file.ts");
    expect(result).toBe(true);
  });
});
