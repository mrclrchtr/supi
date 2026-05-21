import { describe, expect, it, vi } from "vitest";
import type { SessionLspService } from "../../src/session/service-registry.ts";
import { executeRecover } from "../../src/tool/service-actions.ts";

describe("recover service action", () => {
  it("preserves service context when triggering workspace recovery", async () => {
    const recoverSpy = vi.fn();
    const service = {
      async recoverDiagnostics(
        this: SessionLspService,
        options?: {
          restartIfStillStale?: boolean;
        },
      ) {
        recoverSpy(this, options);
        if (this !== service) {
          throw new Error("recoverDiagnostics lost service context");
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
    } as unknown as SessionLspService;

    const result = await executeRecover(service);

    expect(recoverSpy).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ restartIfStillStale: true }),
    );
    expect(result).toContain("recovery complete");
    expect(result).toContain("2 client");
    expect(result).toContain("restarted 1 client");
  });
});
