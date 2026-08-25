// Regression coverage for issue #344: first push-only refresh after reload in
// large workspaces must not invalidate in-flight evidence with no-op didChange
// storms, and the reopen fallback must not reset documents the pass retained.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LspClient } from "../../src/client/client.ts";
import { createRunningTestClient, type TestRpc } from "../helpers/client-test-harness.ts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createFile(name: string, content: string): { filePath: string; uri: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-refresh-retention-"));
  tempDirs.push(tmpDir);
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content);
  return { filePath, uri: `file://${filePath}` };
}

function notificationMethods(rpc: TestRpc): string[] {
  return rpc.sendNotification.mock.calls.map(([method]) => method as string);
}

function callsFor(rpc: TestRpc, method: string, uri: string): number {
  return rpc.sendNotification.mock.calls.filter(
    ([calledMethod, params]) =>
      calledMethod === method &&
      (params as { textDocument?: { uri?: string } })?.textDocument?.uri === uri,
  ).length;
}

function publishEmpty(client: LspClient, uri: string): void {
  client.handlePublishDiagnostics({ uri, diagnostics: [] });
}

/**
 * Model a typescript-language-server-style push pipeline: a didOpen schedules
 * the in-flight publish; a didChange cancels that pass and schedules a much
 * slower full-program re-check; a didClose cancels without rescheduling.
 */
function modelResettingServer(
  rpc: TestRpc,
  schedule: Map<string, ReturnType<typeof setTimeout>>,
  publish: (uri: string) => void,
  delays: { initialMs: number; recheckMs: number },
): void {
  rpc.sendNotification.mockImplementation((method: string, params: unknown) => {
    const uri = (params as { textDocument?: { uri?: string } })?.textDocument?.uri;
    if (!uri) return;
    clearTimeout(schedule.get(uri));
    if (method === "textDocument/didOpen") {
      schedule.set(
        uri,
        setTimeout(() => publish(uri), delays.initialMs),
      );
    } else if (method === "textDocument/didChange") {
      // A change forces a fresh full-program pass that takes longer than any
      // settle window here; a no-op change still restarts the pass.
      schedule.set(
        uri,
        setTimeout(() => publish(uri), delays.recheckMs),
      );
    } else if (method === "textDocument/didClose") {
      schedule.delete(uri);
    }
  });
}

describe("push-only refresh content retention (issue #344)", () => {
  it("confirms unchanged documents from the in-flight pipeline without resync", async () => {
    vi.useFakeTimers();
    const file = createFile("cold.ts", "const cold = 1;");
    const { client, rpc } = createRunningTestClient();
    // Reload semantics: the document opens with current disk content while the
    // server's first diagnostic pass is still in flight (no publish yet).
    client.didOpen(file.filePath, "const cold = 1;");
    rpc.sendNotification.mockClear();

    const schedule = new Map<string, ReturnType<typeof setTimeout>>();
    // The in-flight pass publishes twice 2s after didOpen — inside the 3s
    // window: the first publication is tentative, the second confirms the
    // retained synchronization (ADR 0021).
    schedule.set(
      file.uri,
      setTimeout(() => {
        publishEmpty(client, file.uri);
        publishEmpty(client, file.uri);
      }, 2_000),
    );
    modelResettingServer(rpc, schedule, (uri) => publishEmpty(client, uri), {
      initialMs: 4_000,
      recheckMs: 8_000,
    });

    try {
      const pending = client.refreshOpenDiagnostics({ maxWaitMs: 3_000, quietMs: 50 });
      await vi.advanceTimersByTimeAsync(3_200);

      await expect(pending).resolves.toMatchObject({
        requested: 1,
        confirmed: 1,
        unconfirmed: 0,
        failed: 0,
        removed: 0,
      });
      // No resync storm: unchanged content keeps the synchronization, so the
      // in-flight publish confirms instead of being invalidated and restarted.
      expect(rpc.sendNotification).not.toHaveBeenCalled();
    } finally {
      for (const timer of schedule.values()) clearTimeout(timer);
      vi.useRealTimers();
    }
  });

  it("reports unchanged documents unconfirmed without resetting the server", async () => {
    vi.useFakeTimers();
    const file = createFile("slow.ts", "const slow = 1;");
    const { client, rpc } = createRunningTestClient();
    client.didOpen(file.filePath, "const slow = 1;");
    rpc.sendNotification.mockClear();

    const schedule = new Map<string, ReturnType<typeof setTimeout>>();
    // The in-flight pass needs longer than both settle windows together.
    schedule.set(
      file.uri,
      setTimeout(() => publishEmpty(client, file.uri), 7_000),
    );
    modelResettingServer(rpc, schedule, (uri) => publishEmpty(client, uri), {
      initialMs: 7_000,
      recheckMs: 8_000,
    });

    try {
      const pending = client.refreshOpenDiagnostics({ maxWaitMs: 3_000, quietMs: 50 });
      await vi.advanceTimersByTimeAsync(6_500);

      await expect(pending).resolves.toMatchObject({
        requested: 1,
        confirmed: 0,
        unconfirmed: 1,
        failed: 0,
        removed: 0,
      });
      // The document stays unconfirmed, but the pass must not send didChange,
      // didClose, or didOpen: any of them would cancel the server's in-flight
      // pass and restart the multi-minute pipeline (#344 live reproduction).
      expect(rpc.sendNotification).not.toHaveBeenCalled();
    } finally {
      for (const timer of schedule.values()) clearTimeout(timer);
      vi.useRealTimers();
    }
  });

  it("reopens only documents resynchronized in the pass", async () => {
    const changed = createFile("changed.ts", "const before = 1;");
    const retained = createFile("retained.ts", "const retained = 1;");
    const { client, rpc } = createRunningTestClient();
    // The changed document opens with older content; the retained document
    // opens with current disk content and no evidence yet.
    client.didOpen(changed.filePath, "const before = 0;");
    client.didOpen(retained.filePath, "const retained = 1;");
    rpc.sendNotification.mockClear();
    rpc.sendNotification.mockImplementation((method: string, params: unknown) => {
      const uri = (params as { textDocument?: { uri?: string } })?.textDocument?.uri;
      // The server publishes twice on the fallback didOpen of the changed
      // file: the first publication is tentative, the second confirms the
      // reopened synchronization. The retained file's in-flight publish
      // never arrives in time.
      if (method === "textDocument/didOpen" && uri === changed.uri) {
        publishEmpty(client, changed.uri);
        publishEmpty(client, changed.uri);
      }
    });

    const evidence = await client.refreshOpenDiagnostics({ maxWaitMs: 60, quietMs: 10 });

    expect(evidence).toMatchObject({
      requested: 2,
      confirmed: 1,
      unconfirmed: 1,
      failed: 0,
      removed: 0,
      documents: expect.arrayContaining([
        { file: changed.filePath, status: "confirmed" },
        { file: retained.filePath, status: "unconfirmed" },
      ]),
    });
    expect(callsFor(rpc, "textDocument/didChange", changed.uri)).toBe(1);
    expect(callsFor(rpc, "textDocument/didClose", changed.uri)).toBe(1);
    expect(callsFor(rpc, "textDocument/didOpen", changed.uri)).toBe(1);
    // The retained document receives no protocol traffic at all: no
    // didChange, and the reopen fallback must not reset its pending push.
    expect(notificationMethods(rpc).length).toBe(3);
    expect(callsFor(rpc, "textDocument/didChange", retained.uri)).toBe(0);
    expect(callsFor(rpc, "textDocument/didClose", retained.uri)).toBe(0);
    expect(callsFor(rpc, "textDocument/didOpen", retained.uri)).toBe(0);
  });

  it("resynchronizes unchanged content after a workspace invalidation", async () => {
    const file = createFile("invalidated.ts", "const invalidated = 1;");
    const { client, rpc } = createRunningTestClient();
    client.didOpen(file.filePath, "const invalidated = 1;");
    client.notifyWorkspaceFileChanges([{ uri: file.uri, type: 2 }]);
    rpc.sendNotification.mockClear();
    rpc.sendNotification.mockImplementation((method: string) => {
      if (method === "textDocument/didChange") {
        publishEmpty(client, file.uri);
        publishEmpty(client, file.uri);
      }
    });

    const evidence = await client.refreshOpenDiagnostics({ maxWaitMs: 200, quietMs: 10 });

    // An invalidated generation must re-establish proof through a real
    // didChange even when the disk content is unchanged.
    expect(evidence).toMatchObject({ requested: 1, confirmed: 1, unconfirmed: 0 });
    expect(notificationMethods(rpc)).toEqual(["textDocument/didChange"]);
  });
});
