// Unit tests for buildProjectServerInfo — readiness passthrough.

import { describe, expect, it } from "vitest";
import type { LspClient } from "../../src/client/client.ts";
import { buildProjectServerInfo } from "../../src/manager/manager-project-info.ts";

function makeClient(
  overrides: {
    status?: "running" | "error" | "shutdown" | "initializing";
    openFiles?: string[];
    ready?: boolean;
  } = {},
): LspClient {
  // buildProjectServerInfo only accesses status, serverCapabilities, openFiles,
  // and ready from the client — satisfy the LspClient type with a partial mock.
  return {
    name: "mock",
    root: "/project",
    status: overrides.status ?? "running",
    serverCapabilities: null,
    openFiles: overrides.openFiles ?? [],
    ready: overrides.ready ?? false,
  } as unknown as LspClient;
}

// biome-ignore lint/security/noSecrets: function name, not a secret
describe("buildProjectServerInfo", () => {
  const cwd = "/project";

  it("sets ready to true when client.ready is true", () => {
    const result = buildProjectServerInfo(
      {
        serverName: "typescript",
        root: "/project",
        fileTypes: ["ts", "tsx"],
        client: makeClient({ ready: true }),
      },
      cwd,
    );
    expect(result.ready).toBe(true);
  });

  it("sets ready to false when client.ready is false", () => {
    const result = buildProjectServerInfo(
      {
        serverName: "typescript",
        root: "/project",
        fileTypes: ["ts", "tsx"],
        client: makeClient({ ready: false }),
      },
      cwd,
    );
    expect(result.ready).toBe(false);
  });

  it("sets ready to false when client is undefined", () => {
    const result = buildProjectServerInfo(
      {
        serverName: "typescript",
        root: "/project",
        fileTypes: ["ts", "tsx"],
        client: undefined,
      },
      cwd,
    );
    expect(result.ready).toBe(false);
  });
});
