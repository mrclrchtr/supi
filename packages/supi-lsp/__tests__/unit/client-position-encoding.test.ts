import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LspClient } from "../../src/client/client.ts";

const server = fileURLToPath(new URL("../fixtures/lsp-initialize-server.mjs", import.meta.url));

function createClient(encoding: string, onLifecycle?: (kind: string) => void): LspClient {
  return new LspClient(
    "encoding-test",
    {
      command: process.execPath,
      args: [server, encoding],
      fileTypes: ["ts"],
      rootMarkers: ["package.json"],
    },
    process.cwd(),
    onLifecycle,
  );
}

describe("LspClient position encoding negotiation", () => {
  it.each(["utf-16", "omit"])("accepts the %s server response", async (encoding) => {
    const client = createClient(encoding);

    await expect(client.start()).resolves.toBeUndefined();
    await client.shutdown();
  });

  it("rejects an unexpected server-selected encoding", async () => {
    const transitions: string[] = [];
    const client = createClient("utf-32", (kind) => transitions.push(kind));

    await expect(client.start()).rejects.toThrow(/position encoding.*utf-32/i);
    expect(client.status).toBe("error");
    expect(transitions).toEqual(["crash"]);
  });
});
