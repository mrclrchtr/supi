// LspClient captures `workspace/applyEdit` requests that a server sends while
// running one command, refuses every pushed edit, and resyncs touched documents.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LspClient } from "../../src/client/client.ts";
import { waitFor } from "../helpers/integration-utils.ts";

const server = fileURLToPath(new URL("../fixtures/lsp-apply-edit-server.mjs", import.meta.url));

interface LogEntry {
  method?: string;
  params?: { textDocument?: { uri: string; version: number }; command?: string };
  applyEditReply?: { applied: boolean; failureReason?: string };
}

let root: string;
let file: string;
let uri: string;
let logPath: string;
let client: LspClient;

function logEntries(): LogEntry[] {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LogEntry);
}

function replies(): NonNullable<LogEntry["applyEditReply"]>[] {
  return logEntries().flatMap((entry) => (entry.applyEditReply ? [entry.applyEditReply] : []));
}

function command(name: string) {
  return { title: name, command: name, arguments: [uri] };
}

beforeEach(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lsp-apply-edit-")));
  file = path.join(root, "main.test");
  uri = pathToFileURL(file).href;
  logPath = path.join(root, "server.log");
  fs.writeFileSync(file, "value\n");
  client = new LspClient(
    "fake",
    { command: process.execPath, args: [server, logPath], fileTypes: ["test"], rootMarkers: [] },
    root,
  );
  await client.start();
  client.didOpen(file, "value\n");
});

afterEach(async () => {
  await client.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("LspClient command edit capture", () => {
  it("advertises workspace.applyEdit", () => {
    const initialize = logEntries().find((entry) => entry.method === "initialize");
    expect(initialize?.params).toMatchObject({ capabilities: { workspace: { applyEdit: true } } });
  });

  it("captures exactly one pushed edit, refuses it, and resyncs the touched document", async () => {
    const versionBefore = client.getOpenDocumentVersion(file);

    const result = await client.captureCommandEdits(command("capture.single"), { timeoutMs: 2000 });
    await waitFor(
      async () => replies(),
      (current) => current.length === 1,
    );

    expect(result).toMatchObject({
      kind: "captured",
      edit: { documentChanges: [{ textDocument: { uri, version: versionBefore } }] },
    });
    expect(replies()).toEqual([
      { applied: false, failureReason: "SuPi captured this edit for preview." },
    ]);
    expect(fs.readFileSync(file, "utf8")).toBe("value\n");
    const versionAfter = client.getOpenDocumentVersion(file);
    expect(versionAfter).toBeGreaterThan(versionBefore ?? 0);
    expect(result).toMatchObject({ resynced: [{ file, from: versionBefore, to: versionAfter }] });
    await waitFor(
      async () => logEntries(),
      (entries) =>
        entries.some(
          (entry) =>
            entry.method === "textDocument/didChange" &&
            entry.params?.textDocument?.version === versionAfter,
        ),
    );
  });

  it("reports no edit when the command pushes none", async () => {
    await expect(
      client.captureCommandEdits(command("capture.none"), { timeoutMs: 2000 }),
    ).resolves.toEqual({ kind: "unavailable", reason: "The server command produced no edit." });
  });

  it("refuses every edit and reports unavailable when the command pushes several", async () => {
    await expect(
      client.captureCommandEdits(command("capture.multiple"), { timeoutMs: 2000 }),
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "The server command produced 2 edits; only one can be previewed.",
    });
    await waitFor(
      async () => replies(),
      (current) => current.length === 2,
    );
    expect(replies().every((reply) => reply.applied === false)).toBe(true);
  });

  it("times out a command that never answers and closes the window", async () => {
    await expect(
      client.captureCommandEdits(command("capture.hang"), { timeoutMs: 100, drainMs: 0 }),
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "The server command did not finish within 100 ms.",
    });
    await expect(
      client.captureCommandEdits(command("capture.single"), { timeoutMs: 2000 }),
    ).resolves.toMatchObject({ kind: "captured" });
  });

  it("stops on abort and closes the window", async () => {
    const abort = new AbortController();
    const pending = client.captureCommandEdits(command("capture.hang"), {
      timeoutMs: 5000,
      drainMs: 0,
      control: { signal: abort.signal },
    });
    abort.abort();

    await expect(pending).rejects.toThrow();
    await expect(
      client.captureCommandEdits(command("capture.single"), { timeoutMs: 2000 }),
    ).resolves.toMatchObject({ kind: "captured" });
  });

  it("refuses an unsolicited edit outside any capture window", async () => {
    await client.captureCommandEdits(command("push.unsolicited"), { timeoutMs: 2000 });

    await waitFor(
      async () => replies(),
      (current) => current.length === 1,
    );
    expect(replies()).toEqual([
      { applied: false, failureReason: "SuPi does not accept unsolicited workspace edits." },
    ]);
    expect(fs.readFileSync(file, "utf8")).toBe("value\n");
  });

  it("captures an edit pushed shortly after the command answers", async () => {
    await expect(
      client.captureCommandEdits(command("capture.late"), { timeoutMs: 2000 }),
    ).resolves.toMatchObject({ kind: "captured" });
    await expect(
      waitFor(
        async () => replies(),
        (current) => current.length === 1,
      ),
    ).resolves.toEqual([{ applied: false, failureReason: "SuPi captured this edit for preview." }]);
  });

  it("refuses new captures until a timed-out command settles, so its edit cannot leak", async () => {
    await expect(
      client.captureCommandEdits(command("capture.slow"), { timeoutMs: 100 }),
    ).resolves.toMatchObject({ kind: "unavailable" });

    await expect(
      client.captureCommandEdits(command("capture.none"), { timeoutMs: 2000 }),
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "Another server command capture is running on this client; retry shortly.",
    });
    await waitFor(
      async () => replies(),
      (current) => current.length === 1,
    );
    await expect(
      client.captureCommandEdits(command("capture.none"), { timeoutMs: 2000 }),
    ).resolves.toEqual({ kind: "unavailable", reason: "The server command produced no edit." });
  });

  it("resyncs the full document under incremental sync", async () => {
    await client.captureCommandEdits(command("capture.single"), { timeoutMs: 2000 });

    const changes = await waitFor(
      async () => logEntries().filter((entry) => entry.method === "textDocument/didChange"),
      (current) => current.length > 0,
    );
    const change = changes.at(-1);
    expect(change?.params).toMatchObject({ contentChanges: [{ text: "value\n" }] });
    expect(change?.params).not.toMatchObject({ contentChanges: [{ range: expect.anything() }] });
  });

  it("reports a server error from the command as unavailable", async () => {
    await expect(
      client.captureCommandEdits(command("capture.fail"), { timeoutMs: 2000 }),
    ).resolves.toEqual({ kind: "unavailable", reason: "The server command failed: boom" });
  });

  it("propagates a workflow deadline that expires during the command", async () => {
    await expect(
      client.captureCommandEdits(command("capture.hang"), {
        timeoutMs: 5000,
        drainMs: 0,
        control: { deadline: Date.now() + 100 },
      }),
    ).rejects.toThrow("deadline");
  });

  it("allows one capture at a time per client", async () => {
    const first = client.captureCommandEdits(command("capture.hang"), {
      timeoutMs: 300,
      drainMs: 0,
    });

    await expect(
      client.captureCommandEdits(command("capture.single"), { timeoutMs: 2000 }),
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "Another server command capture is running on this client; retry shortly.",
    });
    await first;
  });
});
