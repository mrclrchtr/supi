import { afterEach, describe, expect, it, vi } from "vitest";
import { maybeLogLoadStatus } from "../../src/status-log.ts";

describe("supi-debug status log", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not expect the removed code_affected tool", () => {
    vi.stubEnv("SUPI_LOG_STATUS", "1");
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const appendEntry = vi.fn();

    maybeLogLoadStatus(
      {
        appendEntry,
        getAllTools: () => [{ name: "code_impact" }],
        getActiveTools: () => ["code_impact"],
        getCommands: () => [{ name: "supi-debug" }],
      } as never,
      "/repo",
    );

    const status = appendEntry.mock.calls[0]?.[1] as {
      expectedTools: Record<string, unknown>;
    };
    expect(status.expectedTools).toHaveProperty("code_impact");
    expect(status.expectedTools).not.toHaveProperty("code_affected");
  });
});
