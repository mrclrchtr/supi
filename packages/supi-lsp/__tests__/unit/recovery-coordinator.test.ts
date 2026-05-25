import { describe, expect, it, vi } from "vitest";
import type { LspManager } from "../../src/manager/manager.ts";
import { createRecoveryCoordinator } from "../../src/manager/recovery-coordinator.ts";

describe("recovery-coordinator", () => {
  const makeManager = () =>
    ({
      recoverWorkspaceDiagnostics: vi.fn().mockResolvedValue({
        refreshedClients: 0,
        restartedClients: 0,
        staleAssessment: { suspected: false, matchedFiles: [], warning: null },
      }),
    }) as unknown as LspManager;

  it("creates a RecoveryCoordinator from a mock LspManager", () => {
    const manager = makeManager();
    const coordinator = createRecoveryCoordinator(manager);
    expect(typeof coordinator.recover).toBe("function");
  });

  it("delegates recover to the manager", async () => {
    const manager = makeManager();
    const coordinator = createRecoveryCoordinator(manager);
    const result = await coordinator.recover({ restartIfStillStale: true });
    expect(manager.recoverWorkspaceDiagnostics).toHaveBeenCalledWith({
      restartIfStillStale: true,
    });
    expect(result.staleAssessment.suspected).toBe(false);
  });
});
