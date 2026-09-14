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
  createPullTestClient,
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

  it("refreshes reusable open documents with native pull and no source change", async () => {
    const file = createDiagnosticTestFile("server-refresh.ts");
    tempDirs.push(file.tmpDir);
    const { client, rpc } = createPullTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    rpc.sendRequest.mockResolvedValueOnce({ kind: "full", items: [] }).mockResolvedValueOnce({
      kind: "full",
      items: [
        {
          message: "fresh server diagnostic",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        },
      ],
    });
    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 1 });
    rpc.sendNotification.mockClear();

    expect((client as AnyClient).handleServerRequest(REFRESH_METHOD, {})).toBeNull();
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(2));
    await flushRefresh();

    expect(rpc.sendNotification).not.toHaveBeenCalledWith(
      expect.stringMatching(/^textDocument\/(?:didChange|didClose|didOpen)$/),
      expect.anything(),
    );
    expect(client.getDiagnostics(file.filePath)).toHaveLength(1);
    expect(
      getDebugEvents({ source: "lsp", category: "diagnostics.refresh-request" }).events,
    ).toEqual([
      expect.objectContaining({
        message: "LSP diagnostic refresh request completed",
        data: expect.objectContaining({ requested: 1, confirmed: 1, unconfirmed: 0 }),
      }),
    ]);
  });

  it("keeps push-only refresh evidence unconfirmed without source synchronization", async () => {
    vi.useFakeTimers();
    const file = createDiagnosticTestFile("push-only-refresh.ts");
    tempDirs.push(file.tmpDir);
    const { client, rpc } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    client.handlePublishDiagnostics({
      uri: file.uri,
      diagnostics: [
        {
          message: "ambient diagnostic",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        },
      ],
    });
    rpc.sendNotification.mockClear();

    expect((client as AnyClient).handleServerRequest(REFRESH_METHOD, {})).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3_000);

    expect(rpc.sendNotification).not.toHaveBeenCalledWith(
      expect.stringMatching(/^textDocument\/(?:didChange|didClose|didOpen)$/),
      expect.anything(),
    );
    expect(client.getDiagnostics(file.filePath)).toHaveLength(1);
    expect(
      getDebugEvents({ source: "lsp", category: "diagnostics.refresh-request" }).events,
    ).toEqual([
      expect.objectContaining({
        message: "LSP diagnostic refresh request completed",
        data: expect.objectContaining({ requested: 1, confirmed: 0, unconfirmed: 1 }),
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
