// Push-only diagnostic refresh reuse and invalidation behavior.

import * as fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { LspClient } from "../../src/client/client.ts";
import {
  createDiagnosticTestFile,
  createRunningTestClient,
  type TestRpc,
} from "../helpers/client-test-harness.ts";

type TestFile = ReturnType<typeof createDiagnosticTestFile>;

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function trackFile(file: TestFile): TestFile {
  tempDirs.push(file.tmpDir);
  return file;
}

function openFile(client: LspClient, file: TestFile): void {
  client.didOpen(file.filePath, fs.readFileSync(file.filePath, "utf-8"));
}

function publishCurrent(client: LspClient, file: TestFile, diagnostics: unknown[]): void {
  const version = client.getOpenDocumentVersion(file.filePath);
  if (version === null) throw new Error("Expected an open document version.");
  client.handlePublishDiagnostics({ uri: file.uri, version, diagnostics });
}

/**
 * Publish the current version twice: the first publication stays tentative,
 * the second confirms the current synchronization (ADR 0021).
 */
function publishConfirmed(client: LspClient, file: TestFile, diagnostics: unknown[]): void {
  publishCurrent(client, file, diagnostics);
  publishCurrent(client, file, diagnostics);
}

function notificationMethods(rpc: TestRpc): string[] {
  return rpc.sendNotification.mock.calls.map(([method]) => method as string);
}

function makeDiagnostic(message: string) {
  return {
    message,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  };
}

describe("push-only diagnostic refresh reuse", () => {
  it("reuses current clean evidence without document resynchronization", async () => {
    const file = trackFile(createDiagnosticTestFile("reusable-clean.ts"));
    const { client, rpc } = createRunningTestClient();
    openFile(client, file);
    publishConfirmed(client, file, []);
    rpc.sendNotification.mockClear();

    await expect(
      client.refreshOpenDiagnostics({ maxWaitMs: 100, quietMs: 1 }),
    ).resolves.toMatchObject({
      requested: 1,
      confirmed: 1,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
      documents: [{ file: file.filePath, status: "confirmed" }],
    });

    expect(rpc.sendNotification).not.toHaveBeenCalled();
  });

  it("reuses current non-empty evidence without losing diagnostics", async () => {
    const file = trackFile(createDiagnosticTestFile("reusable-diagnostics.ts"));
    const diagnostics = [makeDiagnostic("current")];
    const { client, rpc } = createRunningTestClient();
    openFile(client, file);
    publishConfirmed(client, file, diagnostics);
    rpc.sendNotification.mockClear();

    const evidence = await client.refreshOpenDiagnostics({ maxWaitMs: 100, quietMs: 1 });

    expect(evidence.documents).toEqual([{ file: file.filePath, status: "confirmed" }]);
    expect(client.getDiagnostics(file.filePath)).toEqual(diagnostics);
    expect(rpc.sendNotification).not.toHaveBeenCalled();
  });

  it("resynchronizes only the stale subset of a mixed refresh", async () => {
    const reusable = trackFile(createDiagnosticTestFile("reusable.ts"));
    const stale = trackFile(createDiagnosticTestFile("stale.ts"));
    const { client, rpc } = createRunningTestClient();
    openFile(client, reusable);
    openFile(client, stale);
    publishConfirmed(client, reusable, []);
    publishConfirmed(client, stale, []);
    fs.writeFileSync(stale.filePath, "const changed = true;");
    rpc.sendNotification.mockClear();
    rpc.sendNotification.mockImplementation((method: string, params: unknown) => {
      const uri = (params as { textDocument?: { uri?: string } }).textDocument?.uri;
      if (method === "textDocument/didChange" && uri === stale.uri) {
        publishConfirmed(client, stale, [makeDiagnostic("fresh")]);
      }
      return Promise.resolve();
    });

    const evidence = await client.refreshOpenDiagnostics({ maxWaitMs: 100, quietMs: 1 });

    expect(evidence).toMatchObject({ requested: 2, confirmed: 2, unconfirmed: 0 });
    expect(notificationMethods(rpc)).toEqual(["textDocument/didChange"]);
    expect(rpc.sendNotification).toHaveBeenCalledWith(
      "textDocument/didChange",
      expect.objectContaining({
        textDocument: expect.objectContaining({ uri: stale.uri }),
        contentChanges: [{ text: "const changed = true;" }],
      }),
    );
  });

  it("does not reuse evidence after a disk-only content change", async () => {
    const file = trackFile(createDiagnosticTestFile("disk-change.ts"));
    const { client, rpc } = createRunningTestClient();
    openFile(client, file);
    publishConfirmed(client, file, []);
    fs.writeFileSync(file.filePath, "const changedOnDisk = true;");
    rpc.sendNotification.mockClear();
    rpc.sendNotification.mockImplementation((method: string) => {
      if (method === "textDocument/didChange") publishConfirmed(client, file, []);
      return Promise.resolve();
    });

    const evidence = await client.refreshOpenDiagnostics({ maxWaitMs: 100, quietMs: 1 });

    expect(evidence).toMatchObject({ requested: 1, confirmed: 1, unconfirmed: 0 });
    expect(notificationMethods(rpc)).toEqual(["textDocument/didChange"]);
  });

  it("does not reuse evidence after a workspace evidence revision change", async () => {
    const file = trackFile(createDiagnosticTestFile("revision-change.ts"));
    const { client, rpc } = createRunningTestClient();
    openFile(client, file);
    publishConfirmed(client, file, []);
    client.notifyWorkspaceFileChanges([{ uri: file.uri, type: 2 }]);
    rpc.sendNotification.mockClear();
    rpc.sendNotification.mockImplementation((method: string) => {
      if (method === "textDocument/didChange") publishConfirmed(client, file, []);
      return Promise.resolve();
    });

    const evidence = await client.refreshOpenDiagnostics({ maxWaitMs: 100, quietMs: 1 });

    expect(evidence).toMatchObject({ requested: 1, confirmed: 1, unconfirmed: 0 });
    expect(notificationMethods(rpc)).toEqual(["textDocument/didChange"]);
  });
});
