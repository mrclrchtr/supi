import { describe, expect, it, vi } from "vitest";
import type { LspManager } from "../src/manager/manager.ts";
import { executeAction } from "../src/tool-actions.ts";

describe("recover action", () => {
  it("triggers workspace recovery and returns a summary", async () => {
    const manager = {
      getCwd: vi.fn().mockReturnValue("/project"),
      recoverWorkspaceDiagnostics: vi.fn().mockResolvedValue({
        refreshedClients: 2,
        restartedClients: 1,
        staleAssessment: {
          suspected: false,
          matchedFiles: [],
          warning: null,
        },
      }),
    } as unknown as LspManager;

    const result = await executeAction(manager, { action: "recover" });

    const recoveryManager = manager as unknown as {
      recoverWorkspaceDiagnostics: ReturnType<typeof vi.fn>;
    };
    expect(recoveryManager.recoverWorkspaceDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ restartIfStillStale: true }),
    );
    expect(result).toContain("recovery complete");
    expect(result).toContain("2 client");
    expect(result).toContain("restarted 1 client");
  });
});
