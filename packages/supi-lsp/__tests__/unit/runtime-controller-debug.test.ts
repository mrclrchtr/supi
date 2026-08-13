import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectServerInfo } from "../../src/config/types.ts";

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
  it("records bounded aggregate lifecycle facts", () => {
    recordLspRuntimeTransition(transition());

    expect(mocks.recordDebugEvent).toHaveBeenCalledWith({
      source: "lsp",
      level: "debug",
      category: "runtime.transition",
      message: "LSP runtime transition: readiness",
      data: {
        generation: 4,
        kind: "readiness",
        semanticReady: true,
        readyClients: 1,
        totalClients: 3,
        trackedFiles: 2,
      },
    });
  });

  it("records crashes at warning level", () => {
    recordLspRuntimeTransition(transition({ kind: "crash", semanticReady: false }));

    expect(mocks.recordDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "warning",
        category: "runtime.transition",
        message: "LSP runtime transition: crash",
      }),
    );
  });
});
