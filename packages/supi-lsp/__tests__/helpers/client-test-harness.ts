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
};

export function createRunningTestClient(
  options: { capabilities?: ServerCapabilities; root?: string } = {},
): { client: LspClient; rpc: TestRpc } {
  const client = new LspClient(
    "test",
    { command: "echo", args: [], fileTypes: ["ts"], rootMarkers: ["tsconfig.json"] },
    options.root ?? "/project",
  );
  const rpc: TestRpc = {
    sendNotification: vi.fn(async () => {}),
    sendRequest: vi.fn(),
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

export function createPullTestClient(): { client: LspClient; rpc: TestRpc } {
  return createRunningTestClient({
    capabilities: {
      diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
    },
  });
}
