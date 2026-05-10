import { describe, expect, it, vi } from "vitest";
import type { LspManager } from "../src/manager/manager.ts";
import { executeAction } from "../src/tool-actions.ts";

describe("recover action", () => {
  it("preserves manager context when triggering workspace recovery", async () => {
    const recoverSpy = vi.fn();
    const manager = {
      cwd: "/project",
      getCwd(this: { cwd: string }) {
        return this.cwd;
      },
      async recoverWorkspaceDiagnostics(
        this: LspManager & { cwd: string },
        options?: {
          restartIfStillStale?: boolean;
        },
      ) {
        recoverSpy(this, options);
        if (this !== manager) {
          throw new Error("recoverWorkspaceDiagnostics lost manager context");
        }
        return {
          refreshedClients: 2,
          restartedClients: 1,
          staleAssessment: {
            suspected: false,
            matchedFiles: [],
            warning: null,
          },
        };
      },
    } as unknown as LspManager & { cwd: string };

    const result = await executeAction(manager, { action: "recover" });

    expect(recoverSpy).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ restartIfStillStale: true }),
    );
    expect(result).toContain("recovery complete");
    expect(result).toContain("2 client");
    expect(result).toContain("restarted 1 client");
  });
});
