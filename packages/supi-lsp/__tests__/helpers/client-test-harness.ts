import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { LspClient } from "../../src/client/client.ts";
import type { ServerCapabilities } from "../../src/config/types.ts";

type ClientInternals = {
  _status: "running";
  capabilities: ServerCapabilities;
  rpc: TestRpc;
};

export type TestRpc = {
  sendNotification: ReturnType<typeof vi.fn>;
  sendRequest: ReturnType<typeof vi.fn>;
  sendRequestOwned: ReturnType<typeof vi.fn>;
};

export function createRunningTestClient(
  options: {
    capabilities?: ServerCapabilities;
    root?: string;
    cwd?: string;
    name?: string;
    command?: string;
    fileTypes?: string[];
    initializationOptions?: unknown;
  } = {},
): { client: LspClient; rpc: TestRpc } {
  const client = new LspClient(
    options.name ?? "test",
    {
      command: options.command ?? "echo",
      args: [],
      fileTypes: options.fileTypes ?? ["ts"],
      rootMarkers: ["tsconfig.json"],
      initializationOptions: options.initializationOptions,
    },
    options.root ?? "/project",
    undefined,
    options.cwd ?? "/project",
  );
  const sendRequest = vi.fn();
  const rpc: TestRpc = {
    sendNotification: vi.fn(async () => {}),
    sendRequest,
    sendRequestOwned: vi.fn((method: string, params: unknown, options: unknown) => {
      const result = Promise.resolve(sendRequest(method, params, options));
      return {
        result,
        settled: result.then(
          () => undefined,
          () => undefined,
        ),
      };
    }),
  };
  Object.assign(client as unknown as ClientInternals, {
    _status: "running" as const,
    capabilities: options.capabilities ?? {},
    rpc,
  });
  return { client, rpc };
}

export function createDiagnosticTestFile(
  fileName = "test.ts",
  content = "const x = 1;",
): { tmpDir: string; filePath: string; uri: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), "lsp-diagnostic-test-"));
  const filePath = join(tmpDir, fileName);
  writeFileSync(filePath, content);
  return { tmpDir, filePath, uri: `file://${filePath}` };
}

export function createPullTestClient(options: { root?: string; cwd?: string } = {}): {
  client: LspClient;
  rpc: TestRpc;
} {
  return createRunningTestClient({
    ...options,
    capabilities: {
      diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
    },
  });
}

export function createTypeScriptTestClient(
  options: { root?: string; cwd?: string; initializationOptions?: unknown } = {},
): { client: LspClient; rpc: TestRpc } {
  return createRunningTestClient({
    ...options,
    name: "typescript-language-server",
    command: "typescript-language-server",
    fileTypes: ["ts", "tsx", "js", "jsx"],
    capabilities: {
      executeCommandProvider: { commands: ["typescript.tsserverRequest"] },
    },
  });
}
