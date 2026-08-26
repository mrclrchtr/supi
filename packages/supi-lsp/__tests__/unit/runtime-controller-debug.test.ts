import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectServerInfo } from "../../src/config/types.ts";
import {
  boundCwd,
  LSP_REQUEST_TIMEOUT_ERROR_CODE,
  MAX_SERVERS,
  truncateIdentity,
} from "../../src/debug-telemetry.ts";

const mocks = vi.hoisted(() => ({
  recordDebugEvent: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core/debug", () => ({
  recordDebugEvent: mocks.recordDebugEvent,
}));

import type { LspRuntimeTransition } from "../../src/session/runtime-controller.ts";
import { recordLspRuntimeTransition } from "../../src/session/runtime-transition-debug.ts";

const servers: ProjectServerInfo[] = [
  {
    name: "typescript",
    root: "/project",
    fileTypes: ["ts"],
    status: "running",
    supportedActions: [],
    openFiles: ["src/a.ts", "src/b.ts"],
    ready: true,
  },
  {
    name: "bash",
    root: "/project",
    fileTypes: ["sh"],
    status: "running",
    supportedActions: [],
    openFiles: [],
    ready: false,
  },
  {
    name: "python",
    root: "/project",
    fileTypes: ["py"],
    status: "error",
    supportedActions: [],
    openFiles: [],
    ready: false,
  },
];

function transition(overrides: Partial<LspRuntimeTransition> = {}): LspRuntimeTransition {
  return {
    generation: 4,
    kind: "readiness",
    semanticReady: true,
    projectServers: servers,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("LSP runtime transition telemetry", () => {
  it("records bounded aggregate lifecycle facts with workspace identity", () => {
    recordLspRuntimeTransition("/project", transition());

    expect(mocks.recordDebugEvent).toHaveBeenCalledWith({
      source: "lsp",
      level: "debug",
      category: "runtime.transition",
      message: "LSP runtime transition: readiness",
      cwd: "/project",
      data: {
        generation: 4,
        kind: "readiness",
        semanticReady: true,
        readyClients: 1,
        totalClients: 3,
        trackedFiles: 2,
        servers: [
          { name: "typescript", status: "running", ready: true },
          { name: "bash", status: "running", ready: false },
          { name: "python", status: "error", ready: false },
        ],
      },
    });
  });

  it("keeps process-crash status reasons in transition telemetry", () => {
    const firstServer = servers[0];
    if (!firstServer) throw new Error("Expected a test server.");
    recordLspRuntimeTransition(
      "/project",
      transition({
        projectServers: [
          { ...firstServer, status: "error", ready: false, statusReason: "process-crashed" },
        ],
      }),
    );

    const data = mocks.recordDebugEvent.mock.calls[0]?.[0]?.data;
    expect(data.servers).toEqual([
      {
        name: "typescript",
        status: "error",
        ready: false,
        statusReason: "process-crashed",
      },
    ]);
  });

  it("records crashes at warning level", () => {
    recordLspRuntimeTransition("/project", transition({ kind: "crash", semanticReady: false }));

    expect(mocks.recordDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "warning",
        category: "runtime.transition",
        message: "LSP runtime transition: crash",
        cwd: "/project",
      }),
    );
  });

  it("bounds the server list to MAX_SERVERS entries", () => {
    const manyServers: ProjectServerInfo[] = Array.from(
      { length: MAX_SERVERS + 4 },
      (_, index) => ({
        name: `server-${index}`,
        root: "/project",
        fileTypes: ["ts"],
        status: "running" as const,
        supportedActions: [],
        openFiles: [],
        ready: index % 2 === 0,
      }),
    );
    recordLspRuntimeTransition("/project", transition({ projectServers: manyServers }));

    const data = mocks.recordDebugEvent.mock.calls[0]?.[0]?.data;
    expect(data.servers).toHaveLength(MAX_SERVERS);
    expect(data.servers[0]).toEqual({
      name: "server-0",
      status: "running",
      ready: true,
    });
    expect(data.totalClients).toBe(MAX_SERVERS + 4);
  });

  it("truncates long server names to MAX_IDENTITY_STRING with a marker", () => {
    const longName = "x".repeat(600);
    recordLspRuntimeTransition(
      "/project",
      transition({ projectServers: [{ ...servers[0], name: longName }] }),
    );

    const data = mocks.recordDebugEvent.mock.calls[0]?.[0]?.data;
    // The emitted value (marker included) never exceeds MAX_IDENTITY_STRING.
    expect(data.servers[0].name).toBe(`${"x".repeat(511)}…`);
    expect(data.servers[0].name.length).toBe(512);
  });

  it("documents the bounded-identity constants", () => {
    expect(MAX_SERVERS).toBe(16);
    expect(truncateIdentity("short")).toBe("short");
    expect(truncateIdentity("x".repeat(512))).toBe("x".repeat(512));
    expect(LSP_REQUEST_TIMEOUT_ERROR_CODE).toBe(-32095);
    // Event-level cwd bounding: undefined stays absent, long roots truncate.
    expect(boundCwd(undefined)).toBeUndefined();
    expect(boundCwd("x".repeat(600))).toBe(`${"x".repeat(511)}…`);
    expect(boundCwd("x".repeat(600))?.length).toBe(512);
  });
});
