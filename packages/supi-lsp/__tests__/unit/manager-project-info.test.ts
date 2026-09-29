// Unit tests for buildProjectServerInfo — readiness passthrough.

import { describe, expect, it } from "vitest";
import type { LspClient } from "../../src/client/client.ts";
import { buildProjectServerInfo } from "../../src/manager/manager-project-info.ts";

function makeClient(
  overrides: {
    status?: "running" | "error" | "shutdown" | "initializing";
    openFiles?: string[];
    ready?: boolean;
    capabilities?: LspClient["serverCapabilities"];
  } = {},
): LspClient {
  // buildProjectServerInfo only accesses status, serverCapabilities, openFiles,
  // and ready from the client — satisfy the LspClient type with a partial mock.
  return {
    name: "mock",
    root: "/project",
    status: overrides.status ?? "running",
    serverCapabilities: overrides.capabilities ?? null,
    openFiles: overrides.openFiles ?? [],
    ready: overrides.ready ?? false,
  } as unknown as LspClient;
}

// biome-ignore lint/security/noSecrets: function name, not a secret
describe("buildProjectServerInfo", () => {
  const cwd = "/project";

  it.each([
    { client: makeClient({ ready: true }), expected: true },
    { client: makeClient({ ready: false }), expected: false },
    { client: undefined, expected: false },
  ])("projects client readiness as $expected", ({ client, expected }) => {
    const result = buildProjectServerInfo(
      {
        serverName: "typescript",
        root: "/project",
        fileTypes: ["ts", "tsx"],
        client,
      },
      cwd,
    );

    expect(result.ready).toBe(expected);
  });

  it("projects negotiated operation support without guessing titles", () => {
    const result = buildProjectServerInfo(
      {
        serverName: "typescript",
        root: "/project",
        fileTypes: ["ts"],
        client: makeClient({
          capabilities: {
            renameProvider: { prepareProvider: true },
            codeActionProvider: {
              codeActionKinds: ["source.organizeImports"],
              resolveProvider: true,
            },
          },
        }),
      },
      cwd,
    );

    expect(result.operationSupport).toMatchObject({
      rename_symbol: { server: "advertised", supi: "supported" },
      prepare_rename: { server: "advertised" },
      update_imports: { server: "advertised" },
      code_action_resolve: { server: "advertised" },
      extract_function: { server: "not-advertised", supi: "limited" },
    });
  });

  it("reports every process-crash reason as an error status", () => {
    for (const statusReason of [
      "process-crashed",
      "process-crash-recovery-pending",
      "process-crash-recovery-exhausted",
    ] as const) {
      const result = buildProjectServerInfo(
        {
          serverName: "typescript",
          root: "/project",
          fileTypes: ["ts"],
          client: makeClient({ status: "running", ready: true }),
          statusReason,
        },
        cwd,
      );

      expect(result).toMatchObject({ status: "error", statusReason, ready: true });
    }
  });
});
