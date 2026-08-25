import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { LspClient } from "../../src/client/client.ts";
import { createRunningTestClient } from "../helpers/client-test-harness.ts";

const initializeServer = fileURLToPath(
  new URL("../fixtures/lsp-initialize-server.mjs", import.meta.url),
);
const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("LSP server startup", () => {
  it("sends the workspace folder, initialization options, and environment", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-handshake-"));
    tempDirectories.push(root);
    const recordPath = path.join(root, "handshake.json");
    const client = new LspClient(
      "test",
      {
        command: process.execPath,
        args: [initializeServer, "utf-16", recordPath],
        fileTypes: ["test"],
        rootMarkers: [],
        env: { SUPI_TEST_LSP_ENV: "configured" },
        initializationOptions: { mode: "project" },
      },
      root,
    );

    await client.start();
    const handshake = JSON.parse(fs.readFileSync(recordPath, "utf8")) as {
      env: string;
      params: {
        workspaceFolders: Array<{ name: string; uri: string }>;
        initializationOptions: unknown;
        capabilities: {
          workspace?: {
            configuration?: boolean;
            didChangeWatchedFiles?: unknown;
            workspaceFolders?: boolean;
          };
        };
      };
    };

    expect(handshake.env).toBe("configured");
    expect(handshake.params.workspaceFolders).toEqual([
      { name: path.basename(root), uri: `file://${root}` },
    ]);
    expect(handshake.params.capabilities.workspace?.workspaceFolders).toBe(true);
    expect(handshake.params.capabilities.workspace).not.toHaveProperty("configuration");
    expect(handshake.params.capabilities.workspace).not.toHaveProperty("didChangeWatchedFiles");
    expect(handshake.params.initializationOptions).toEqual({ mode: "project" });

    await client.shutdown();
  });
});

describe("LSP document synchronization", () => {
  it.each([
    ["an empty document", "", { line: 0, character: 0 }],
    ["a final line", "abc", { line: 0, character: 3 }],
    ["a trailing newline", "abc\n", { line: 1, character: 0 }],
    ["CRLF lines", "abc\r\ndef", { line: 1, character: 3 }],
  ])("replaces the full range of %s for incremental servers", (_label, previous, end) => {
    const { client, rpc } = createRunningTestClient({
      capabilities: { textDocumentSync: { change: 2, openClose: true } },
    });
    const file = "/project/src/index.ts";

    client.didOpen(file, previous);
    rpc.sendNotification.mockClear();
    client.didChange(file, "updated");

    expect(rpc.sendNotification).toHaveBeenCalledWith("textDocument/didChange", {
      textDocument: { uri: "file:///project/src/index.ts", version: 2 },
      contentChanges: [
        {
          range: {
            start: { line: 0, character: 0 },
            end,
          },
          text: "updated",
        },
      ],
    });
  });
});
