// Real TypeScript push-only diagnostic refresh probe.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { LspClient } from "../../src/client/client.ts";
import type { ServerConfig } from "../../src/config/types.ts";
import { hasCommand } from "../helpers/integration-utils.ts";

const TSSERVER = path.resolve(
  import.meta.dirname,
  "../../../../node_modules/typescript/lib/tsserver.js",
);
const HAS_TS_LSP = hasCommand("typescript-language-server") && fs.existsSync(TSSERVER);
const TS_SERVER_CONFIG: ServerConfig = {
  command: "typescript-language-server",
  args: ["--stdio"],
  fileTypes: ["ts"],
  rootMarkers: ["tsconfig.json", "package.json"],
  initializationOptions: { tsserver: { path: TSSERVER } },
};
const DOCUMENT_SYNC_METHODS = new Set([
  "textDocument/didChange",
  "textDocument/didClose",
  "textDocument/didOpen",
]);

type ClientRpc = {
  sendNotification(method: string, params: unknown): Promise<unknown>;
};

describe.skipIf(!HAS_TS_LSP)("TypeScript diagnostic refresh probe", () => {
  let tmpDir = "";
  let firstFile = "";
  let secondFile = "";
  let client: LspClient;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-refresh-probe-"));
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "ESNext" },
        include: ["*.ts"],
      }),
    );
    firstFile = path.join(tmpDir, "first-clean.ts");
    secondFile = path.join(tmpDir, "second-clean.ts");
    fs.writeFileSync(firstFile, "export const firstClean = true;\n");
    fs.writeFileSync(secondFile, "export const secondClean = true;\n");

    client = new LspClient(
      "typescript-language-server",
      TS_SERVER_CONFIG,
      tmpDir,
      undefined,
      tmpDir,
    );
    await client.start();
    await client.getReady();
  }, 20_000);

  afterEach(() => {
    resetDebugRegistry();
  });

  afterAll(async () => {
    if (client?.status === "running") await client.shutdown();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reuses two clean documents on the second default refresh", async () => {
    configureDebugRegistry({ enabled: true, maxEvents: 100 });
    const firstContent = fs.readFileSync(firstFile, "utf-8");
    const secondContent = fs.readFileSync(secondFile, "utf-8");
    client.didOpen(firstFile, firstContent);
    client.didOpen(secondFile, secondContent);
    client.notifyWorkspaceFileChanges([
      { uri: `file://${firstFile}`, type: 2 },
      { uri: `file://${secondFile}`, type: 2 },
    ]);

    const firstStartedAt = Date.now();
    const firstEvidence = await client.refreshOpenDiagnostics();
    const firstElapsedMs = Date.now() - firstStartedAt;
    expect(client.getDiagnosticSnapshot()).toMatchObject({
      current: true,
      documents: [
        { uri: `file://${firstFile}`, current: true, status: "confirmed" },
        { uri: `file://${secondFile}`, current: true, status: "confirmed" },
      ],
    });

    const rpc = (client as unknown as { rpc: ClientRpc }).rpc;
    const documentNotifications: string[] = [];
    const sendNotification = rpc.sendNotification.bind(rpc);
    rpc.sendNotification = async (method, params) => {
      if (DOCUMENT_SYNC_METHODS.has(method)) documentNotifications.push(method);
      return sendNotification(method, params);
    };

    const secondStartedAt = Date.now();
    const secondEvidence = await client.refreshOpenDiagnostics();
    const secondElapsedMs = Date.now() - secondStartedAt;

    expect(firstEvidence).toMatchObject({
      requested: 2,
      confirmed: 2,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
    });
    expect(secondEvidence).toMatchObject({
      requested: 2,
      confirmed: 2,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
    });
    expect(documentNotifications).toEqual([]);
    expect({ firstElapsedMs, secondElapsedMs }).toEqual({
      firstElapsedMs: expect.any(Number),
      secondElapsedMs: expect.any(Number),
    });
    expect(secondElapsedMs).toBeLessThan(firstElapsedMs);

    const refreshEvents = getDebugEvents({
      source: "lsp",
      category: "diagnostics.timing",
    }).events.filter(
      (event) =>
        typeof event.data === "object" &&
        event.data !== null &&
        "operation" in event.data &&
        event.data.operation === "refresh-open",
    );
    expect(refreshEvents[0]?.data).toEqual(
      expect.objectContaining({
        collection: "cache",
        pull: "not-used",
        push: "not-used",
        settle: "not-used",
        outcome: "completed",
        freshness: "observed",
        documentCount: 2,
        timedOut: false,
      }),
    );
    expect(refreshEvents[0]?.data).not.toHaveProperty("reopen");
  }, 20_000);
});
