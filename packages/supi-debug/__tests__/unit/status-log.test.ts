import { afterEach, describe, expect, it, vi } from "vitest";
import { maybeLogLoadStatus } from "../../src/status-log.ts";

describe("supi-debug status log", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("emits a versioned inventory without expected-resource policy", () => {
    vi.stubEnv("SUPI_LOG_STATUS", "1");
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const appendEntry = vi.fn();

    maybeLogLoadStatus(
      {
        appendEntry,
        getAllTools: () => [{ name: "code_impact" }, { name: "debug" }],
        getActiveTools: () => ["debug"],
        getCommands: () => [{ name: "supi-debug" }],
      } as never,
      "/repo",
    );

    const status = appendEntry.mock.calls[0]?.[1] as {
      version: number;
      phase: string;
      tools: { registered: string[]; active: string[] };
      commands: string[];
      expectedTools?: unknown;
      expectedCommands?: unknown;
    };
    expect(status.version).toBe(2);
    expect(status.phase).toBe("session_start");
    expect(status.tools.registered).toEqual(["code_impact", "debug"]);
    expect(status.tools.active).toEqual(["debug"]);
    expect(status.commands).toEqual(["supi-debug"]);
    expect(status.expectedTools).toBeUndefined();
    expect(status.expectedCommands).toBeUndefined();
  });
});
