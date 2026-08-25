// Unit tests for server-requested workspace diagnostic refresh handling.

import { rmSync } from "node:fs";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiagnosticEvidenceSummary } from "../../src/diagnostics/evidence.ts";
import {
  createDiagnosticTestFile,
  createRunningTestClient,
} from "../helpers/client-test-harness.ts";

// biome-ignore lint/suspicious/noExplicitAny: accessing the private request handler at its protocol boundary
type AnyClient = any;

const REFRESH_METHOD = "workspace/diagnostic/refresh";
const tempDirs: string[] = [];

function evidenceSummary(): DiagnosticEvidenceSummary {
  return {
    requested: 2,
    confirmed: 1,
    unconfirmed: 0,
    failed: 1,
    removed: 0,
    documents: [
      { file: "src/private.py", status: "confirmed" },
      { file: "src/failed.py", status: "failed" },
    ],
  };
}

async function flushRefresh(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  resetDebugRegistry();
  configureDebugRegistry({ enabled: true, maxEvents: 20 });
});

afterEach(() => {
  vi.useRealTimers();
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
  resetDebugRegistry();
});

describe("LSP server-requested diagnostic refresh", () => {
  it("returns null immediately and records aggregate success after the refresh", async () => {
    const { client } = createRunningTestClient();
    const refresh = vi
      .spyOn(client as AnyClient, "refreshForServerRequest")
      .mockResolvedValue(evidenceSummary());

    expect((client as AnyClient).handleServerRequest(REFRESH_METHOD, {})).toBeNull();
    expect(refresh).not.toHaveBeenCalled();

    await flushRefresh();
    expect(refresh).toHaveBeenCalledWith();

    const events = getDebugEvents({
      source: "lsp",
      category: "diagnostics.refresh-request",
    }).events;
    expect(events).toEqual([
      expect.objectContaining({
        level: "debug",
        message: "LSP diagnostic refresh request completed",
        cwd: "/project",
        data: {
          outcome: "completed",
          server: "test",
          requested: 2,
          confirmed: 1,
          unconfirmed: 0,
          failed: 1,
          removed: 0,
        },
      }),
    ]);
    expect(events[0]?.data).not.toHaveProperty("documents");
    expect(JSON.stringify(events)).not.toContain("private.py");
  });

  it("consumes a rejected refresh and records one failure event", async () => {
    const { client } = createRunningTestClient();
    vi.spyOn(client as AnyClient, "refreshForServerRequest").mockRejectedValue(
      new Error("private diagnostic failure"),
    );

    expect((client as AnyClient).handleServerRequest(REFRESH_METHOD, {})).toBeNull();
    await flushRefresh();

    const events = getDebugEvents({
      source: "lsp",
      category: "diagnostics.refresh-request",
    }).events;
    expect(events).toEqual([
      expect.objectContaining({
        message: "LSP diagnostic refresh request failed",
        cwd: "/project",
        data: { outcome: "failed", server: "test" },
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain("private diagnostic failure");
  });

  it("force-resynchronizes reusable open documents", async () => {
    vi.useFakeTimers();
    const file = createDiagnosticTestFile("forced-refresh.ts");
    tempDirs.push(file.tmpDir);
    const { client, rpc } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    const version = client.getOpenDocumentVersion(file.filePath);
    if (version === null) throw new Error("Expected an open document version.");
    client.handlePublishDiagnostics({ uri: file.uri, version, diagnostics: [] });
    rpc.sendNotification.mockClear();
    rpc.sendNotification.mockImplementation((method: string) => {
      if (method === "textDocument/didChange") {
        // Publish twice: the first publication is tentative, the second
        // confirms the resynchronized document (ADR 0021).
        const currentVersion = client.getOpenDocumentVersion(file.filePath);
        client.handlePublishDiagnostics({
          uri: file.uri,
          version: currentVersion ?? undefined,
          diagnostics: [],
        });
        client.handlePublishDiagnostics({
          uri: file.uri,
          version: currentVersion ?? undefined,
          diagnostics: [],
        });
      }
      return Promise.resolve();
    });

    expect((client as AnyClient).handleServerRequest(REFRESH_METHOD, {})).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(250);

    expect(rpc.sendNotification).toHaveBeenCalledWith(
      "textDocument/didChange",
      expect.objectContaining({ textDocument: { uri: file.uri, version: 2 } }),
    );
    expect(
      getDebugEvents({ source: "lsp", category: "diagnostics.refresh-request" }).events,
    ).toEqual([
      expect.objectContaining({
        message: "LSP diagnostic refresh request completed",
        data: expect.objectContaining({ requested: 1, confirmed: 1 }),
      }),
    ]);
  });

  it("does not send pull requests when no documents are tracked", async () => {
    const { client, rpc } = createRunningTestClient();

    expect((client as AnyClient).handleServerRequest(REFRESH_METHOD, {})).toBeNull();
    await flushRefresh();

    expect(rpc.sendRequest).not.toHaveBeenCalled();
    expect(
      getDebugEvents({ source: "lsp", category: "diagnostics.refresh-request" }).events,
    ).toEqual([
      expect.objectContaining({
        data: {
          outcome: "completed",
          server: "test",
          requested: 0,
          confirmed: 0,
          unconfirmed: 0,
          failed: 0,
          removed: 0,
        },
      }),
    ]);
  });

  it("does not send pull requests when the client is not operational", async () => {
    const { client, rpc } = createRunningTestClient();
    client.didOpen("/project/tracked.ts", "const tracked = true;\n");
    (client as AnyClient)._status = "error";

    expect((client as AnyClient).handleServerRequest(REFRESH_METHOD, {})).toBeNull();
    await flushRefresh();

    expect(rpc.sendRequest).not.toHaveBeenCalled();
    expect(
      getDebugEvents({ source: "lsp", category: "diagnostics.refresh-request" }).events,
    ).toHaveLength(1);
  });
});
