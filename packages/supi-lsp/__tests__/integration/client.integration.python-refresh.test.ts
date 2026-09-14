// Real Pyright server-requested diagnostic refresh idle regression.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { LspClient } from "../../src/client/client.ts";
import type { ServerConfig } from "../../src/config/types.ts";
import { hasCommand, waitFor } from "../helpers/integration-utils.ts";

const PYRIGHT_CONFIG: ServerConfig = {
  command: "pyright-langserver",
  args: ["--stdio"],
  fileTypes: ["py", "pyi"],
  rootMarkers: ["pyrightconfig.json", "pyproject.toml", "requirements.txt"],
};
const HAS_PYRIGHT = hasCommand("pyright-langserver");
const DOCUMENT_SYNC_METHODS = new Set([
  "textDocument/didChange",
  "textDocument/didClose",
  "textDocument/didOpen",
]);

type AnyClient = {
  refreshForServerRequest(): Promise<unknown>;
  rpc: {
    sendNotification(method: string, params: unknown): Promise<void>;
  };
};

describe.skipIf(!HAS_PYRIGHT)("Pyright server-requested diagnostic refresh", () => {
  let tmpDir = "";
  let file = "";
  let client: LspClient | undefined;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-py-refresh-idle-"));
    file = path.join(tmpDir, "idle.py");
    fs.writeFileSync(path.join(tmpDir, "pyrightconfig.json"), "{}\n");
    fs.writeFileSync(file, "value: int = 1\n");

    client = new LspClient("pyright-langserver", PYRIGHT_CONFIG, tmpDir, undefined, tmpDir);
    await client.start();
    await waitFor(
      async () => Promise.resolve(client?.hasDiagnosticProvider ?? false),
      (hasProvider) => hasProvider,
      { timeoutMs: 10_000, retryDelayMs: 50, label: "Pyright diagnostic pull registration" },
    );
  }, 20_000);

  afterAll(async () => {
    if (client?.status === "running") await client.shutdown();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does not create an idle refresh and source-change feedback loop", async () => {
    if (!client) throw new Error("Pyright client was not started.");
    const internals = client as unknown as AnyClient;
    const refresh = vi.spyOn(internals, "refreshForServerRequest");
    const documentNotifications: string[] = [];
    const sendNotification = internals.rpc.sendNotification.bind(internals.rpc);
    internals.rpc.sendNotification = async (method, params) => {
      if (DOCUMENT_SYNC_METHODS.has(method)) documentNotifications.push(method);
      return sendNotification(method, params);
    };

    const content = fs.readFileSync(file, "utf8");
    client.didOpen(file, content);
    await waitFor(
      async () => Promise.resolve(refresh.mock.calls.length),
      (count) => count > 0,
      { timeoutMs: 10_000, retryDelayMs: 50, label: "Pyright server diagnostic refresh" },
    );
    await waitFor(
      async () => Promise.resolve(client?.getDiagnosticSnapshot()),
      (snapshot) => snapshot?.current === true,
      { timeoutMs: 10_000, retryDelayMs: 50, label: "settled Pyright diagnostics" },
    );

    documentNotifications.length = 0;
    const refreshCountAfterWarmup = refresh.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    expect(documentNotifications).toEqual([]);
    expect(refresh.mock.calls.length).toBe(refreshCountAfterWarmup);
    refresh.mockRestore();
  }, 30_000);
});
