import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { LspClient } from "../../src/client/client.ts";

const serverFixture = fileURLToPath(
  new URL("../fixtures/lsp-content-modified-server.mjs", import.meta.url),
);
const temporaryDirectories: string[] = [];
const clients: LspClient[] = [];

async function startClient(contentModifiedLimit: number | "always" | "busy"): Promise<{
  client: LspClient;
  filePath: string;
  logPath: string;
}> {
  const root = mkdtempSync(join(tmpdir(), "lsp-content-modified-runtime-"));
  temporaryDirectories.push(root);
  const filePath = join(root, "main.rs");
  const logPath = join(root, "requests.log");
  writeFileSync(filePath, "fn main() {}\n");
  const client = new LspClient(
    "content-modified-test",
    {
      command: process.execPath,
      args: [serverFixture, logPath, String(contentModifiedLimit)],
      fileTypes: ["rs"],
      rootMarkers: [],
    },
    root,
    undefined,
    root,
  );
  clients.push(client);
  await client.start();
  client.didOpen(filePath, "fn main() {}\n");
  return { client, filePath, logPath };
}

function countHoverRequests(logPath: string): number {
  return readFileSync(logPath, "utf8")
    .split("\n")
    .filter((method) => method === "textDocument/hover").length;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.shutdown()));
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("LSP ContentModified JSON-RPC runtime", () => {
  it("sends the same read-only request once more after ContentModified", async () => {
    const { client, filePath, logPath } = await startClient(1);

    await expect(client.hover(filePath, { line: 0, character: 3 })).resolves.toEqual({
      kind: "completed",
      data: { contents: { kind: "plaintext", value: "current result" } },
    });
    expect(countHoverRequests(logPath)).toBe(2);
  });

  it("allows a busy server to settle before retrying a read-only request", async () => {
    const { client, filePath, logPath } = await startClient("busy");

    await expect(client.hover(filePath, { line: 0, character: 3 })).resolves.toEqual({
      kind: "completed",
      data: { contents: { kind: "plaintext", value: "current result" } },
    });
    expect(countHoverRequests(logPath)).toBe(2);
  });

  it("returns unavailable after two ContentModified responses", async () => {
    const { client, filePath, logPath } = await startClient("always");

    await expect(client.hover(filePath, { line: 0, character: 3 })).resolves.toEqual({
      kind: "unavailable",
      reason:
        "LSP request textDocument/hover failed: content modified Request retry exhausted after 1 retry.",
    });
    expect(countHoverRequests(logPath)).toBe(2);
  });
});
