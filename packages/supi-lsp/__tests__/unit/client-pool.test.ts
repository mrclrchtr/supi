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
    expect(typeof pool.ensureFileOpen).toBe("function");
    expect(typeof pool.shutdownAll).toBe("function");
  });

  it("delegates ensureFileOpen to the manager", async () => {
    const manager = {
      ensureFileOpen: vi.fn().mockResolvedValue({}),
      shutdownAll: vi.fn().mockResolvedValue(undefined),
    } as unknown as LspManager;

    const pool = createClientPool(manager);
    const result = await pool.ensureFileOpen("/test/file.ts");
    expect(manager.ensureFileOpen).toHaveBeenCalledWith("/test/file.ts");
    expect(result).toEqual({});
  });
});
