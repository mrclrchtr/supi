// Passive snapshots withdraw confirmation after an external disk change (#599).

import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LspClient } from "../../src/client/client.ts";
import {
  createDiagnosticTestFile,
  createPullTestClient,
  type TestRpc,
} from "../helpers/client-test-harness.ts";

type TestFile = ReturnType<typeof createDiagnosticTestFile>;

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function trackFile(fileName: string, content = "const x = 1;"): TestFile {
  const file = createDiagnosticTestFile(fileName, content);
  tempDirs.push(file.tmpDir);
  return file;
}

function addFile(dir: string, fileName: string, content = "const y = 1;"): TestFile {
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, content);
  return { tmpDir: dir, filePath, uri: `file://${filePath}` };
}

/** Track a file through a disk read and confirm it with a pull response. */
async function confirmFromDisk(client: LspClient, rpc: TestRpc, file: TestFile): Promise<void> {
  rpc.sendRequest.mockResolvedValue({ kind: "full", items: [] });
  const result = await client.syncAndWaitForDiagnostics(
    file.filePath,
    fs.readFileSync(file.filePath, "utf-8"),
    undefined,
    { contentIsAuthoritative: false },
  );
  expect(result).toEqual({ kind: "completed", data: [] });
}

function documentFor(client: LspClient, file: TestFile) {
  return client.getDiagnosticSnapshot().documents.find((document) => document.uri === file.uri);
}

/** Move mtime forward so a same-size rewrite is visible on any timestamp resolution. */
function bumpMtime(filePath: string): void {
  const later = new Date(Date.now() + 5_000);
  fs.utimesSync(filePath, later, later);
}

function didChangeCount(rpc: TestRpc): number {
  return rpc.sendNotification.mock.calls.filter(([method]) => method === "textDocument/didChange")
    .length;
}

describe("disk-stamp freshness in passive snapshots", () => {
  it("reports an externally edited confirmed file as unconfirmed with reason disk-changed", async () => {
    const file = trackFile("external-edit.ts");
    const { client, rpc } = createPullTestClient();
    await confirmFromDisk(client, rpc, file);
    expect(documentFor(client, file)).toEqual({
      uri: file.uri,
      current: true,
      status: "confirmed",
    });

    fs.writeFileSync(file.filePath, "const x: number = 'broken';");

    expect(documentFor(client, file)).toEqual({
      uri: file.uri,
      current: false,
      status: "unconfirmed",
      reason: "disk-changed",
    });
    expect(client.getDiagnosticSnapshot().current).toBe(false);
  });

  it("marks retained diagnostics of a changed file as not current", async () => {
    const file = trackFile("stale-entry.ts");
    const { client, rpc } = createPullTestClient();
    rpc.sendRequest.mockResolvedValue({
      kind: "full",
      items: [
        {
          message: "old error",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        },
      ],
    });
    await client.syncAndWaitForDiagnostics(
      file.filePath,
      fs.readFileSync(file.filePath, "utf-8"),
      undefined,
      { contentIsAuthoritative: false },
    );
    expect(client.getDiagnosticSnapshot().entries).toMatchObject([{ current: true }]);

    fs.writeFileSync(file.filePath, "const fixed = 1;");

    // Stale diagnostics stay visible as partial evidence, but are not current.
    expect(client.getDiagnosticSnapshot().entries).toMatchObject([
      { uri: file.uri, current: false },
    ]);
  });

  it("detects an atomic replace through rename", async () => {
    const file = trackFile("atomic.ts");
    const { client, rpc } = createPullTestClient();
    await confirmFromDisk(client, rpc, file);

    const temp = `${file.filePath}.tmp`;
    fs.writeFileSync(temp, "const x = 1;");
    fs.renameSync(temp, file.filePath);

    expect(documentFor(client, file)).toMatchObject({
      status: "unconfirmed",
      reason: "disk-changed",
    });
  });

  it("restores confirmation after a touch through a same-route request without didChange", async () => {
    const touched = trackFile("touched.ts");
    const other = addFile(touched.tmpDir, "other.ts");
    const { client, rpc } = createPullTestClient();
    await confirmFromDisk(client, rpc, touched);
    bumpMtime(touched.filePath);
    expect(documentFor(client, touched)).toMatchObject({ reason: "disk-changed" });
    const changesBefore = didChangeCount(rpc);

    // A request on another file of the same route runs the shared input
    // barrier, which re-reads every open document and verifies equal content.
    await confirmFromDisk(client, rpc, other);

    expect(documentFor(client, touched)).toEqual({
      uri: touched.uri,
      current: true,
      status: "confirmed",
    });
    expect(didChangeCount(rpc)).toBe(changesBefore);
  });

  it("refreshes the stamp of unchanged content during refresh without didChange", async () => {
    const file = trackFile("refresh-touch.ts");
    const { client, rpc } = createPullTestClient();
    await confirmFromDisk(client, rpc, file);
    bumpMtime(file.filePath);
    rpc.sendNotification.mockClear();

    await client.refreshOpenDiagnostics({ maxWaitMs: 100, quietMs: 1 });

    expect(documentFor(client, file)).toEqual({
      uri: file.uri,
      current: true,
      status: "confirmed",
    });
    expect(didChangeCount(rpc)).toBe(0);
  });

  it("resynchronizes changed content during refresh and confirms it again", async () => {
    const file = trackFile("refresh-edit.ts");
    const { client, rpc } = createPullTestClient();
    await confirmFromDisk(client, rpc, file);
    fs.writeFileSync(file.filePath, "const changed = 2;");
    expect(documentFor(client, file)).toMatchObject({ reason: "disk-changed" });

    await client.refreshOpenDiagnostics({ maxWaitMs: 100, quietMs: 1 });

    expect(didChangeCount(rpc)).toBe(1);
    expect(documentFor(client, file)).toEqual({
      uri: file.uri,
      current: true,
      status: "confirmed",
    });
  });

  it("keeps a file unconfirmed when it changes between stat and read", async () => {
    const file = trackFile("race.ts");
    const { client, rpc } = createPullTestClient();
    // The first open stats, then reads. Change the file inside the read so
    // the stored stamp is older than the content that was synchronized.
    await client.openDocument(file.filePath, () => {
      const content = fs.readFileSync(file.filePath, "utf-8");
      fs.writeFileSync(file.filePath, "const later = 22;");
      return content;
    });
    // Confirm the originally read content through authoritative content. The
    // barrier's disk read differs from it, so that read records no stamp.
    rpc.sendRequest.mockResolvedValue({ kind: "full", items: [] });
    await expect(client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;")).resolves.toEqual({
      kind: "completed",
      data: [],
    });

    // A stat after the read would match the new disk state and claim
    // confirmation for the old content. The pre-read stamp fails closed.
    expect(documentFor(client, file)).toMatchObject({
      status: "unconfirmed",
      reason: "disk-changed",
    });
  });

  it("keeps documents opened from explicit content without a disk comparison", () => {
    const file = trackFile("explicit.ts");
    const { client } = createPullTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    fs.writeFileSync(file.filePath, "const x = 2;");

    // No disk read, so no stamp: the snapshot keeps today's behavior.
    expect(documentFor(client, file)?.reason).toBeUndefined();
  });
});
