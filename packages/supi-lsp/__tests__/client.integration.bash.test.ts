// Integration tests — LspClient against bash-language-server for real Bash LSP.
// Requires bash-language-server on PATH.
//
// Bash-language-server provides startup/shutdown, diagnostics, and basic
// semantic operations. Semantic tests (hover, symbols) are best-effort since
// shellscript analysis is inherently dynamic and server responses vary across
// versions.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LspClient } from "../src/client/client.ts";
import type { ServerConfig } from "../src/types.ts";
import { hasCommand } from "./integration-utils.ts";

const BASH_SERVER_CONFIG: ServerConfig = {
  command: "bash-language-server",
  args: ["start"],
  fileTypes: ["sh", "bash", "zsh", "ksh"],
  rootMarkers: [],
};

const HAS_BASH_LSP = hasCommand("bash-language-server");

// ── Fixture Setup ─────────────────────────────────────────────────────

let tmpDir: string;
let validFile: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-bash-integration-"));
  validFile = path.join(tmpDir, "test.sh");
  fs.writeFileSync(
    validFile,
    [
      "#!/bin/bash",
      "# A simple bash script with a function",
      "say_hello() {",
      '  local name="$1"',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture bash source
      '  echo "Hello, ${name}"',
      "}",
      "",
      'say_hello "world"',
      "",
    ].join("\n"),
  );
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────

describe.skipIf(!HAS_BASH_LSP)("LspClient integration (bash-language-server)", () => {
  let client: LspClient;

  afterAll(async () => {
    if (client?.status === "running") {
      await client.shutdown();
    }
  });

  it("starts and initializes successfully", async () => {
    client = new LspClient("bash-language-server", BASH_SERVER_CONFIG, tmpDir);
    await client.start();
    expect(client.status).toBe("running");
  }, 15_000);

  it("opens a document and tracks it", () => {
    const content = fs.readFileSync(validFile, "utf-8");
    client.didOpen(validFile, content);
    expect(client.openFiles).toContain(validFile);
  });

  it("returns diagnostics (may be empty for valid syntax)", async () => {
    const content = fs.readFileSync(validFile, "utf-8");
    const diagnostics = await client.syncAndWaitForDiagnostics(validFile, content);
    expect(Array.isArray(diagnostics)).toBe(true);
    // bash-language-server may or may not report diagnostics for valid syntax
  }, 15_000);

  it("returns document symbols (best-effort)", async () => {
    const symbols = await client.documentSymbols(validFile);
    // bash-language-server supports documentSymbolProvider per capabilities
    // The response may be null, an array, or a flat list depending on version
    expect(symbols === null || Array.isArray(symbols)).toBe(true);
  }, 10_000);

  it("closes a document and removes from tracking", () => {
    client.didClose(validFile);
    expect(client.openFiles).not.toContain(validFile);
  });

  it("shuts down cleanly", async () => {
    await client.shutdown();
    expect(client.status).toBe("shutdown");
  }, 10_000);
});

describe.skipIf(!HAS_BASH_LSP)("LspClient bash shutdown-after-open", () => {
  it("shuts down cleanly after opening a document", async () => {
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-bash-shutdown-"));
    const sf = path.join(tmpDir2, "s.sh");
    fs.writeFileSync(sf, "echo ok\n");

    const c = new LspClient("bash", BASH_SERVER_CONFIG, tmpDir2);
    await c.start();
    c.didOpen(sf, fs.readFileSync(sf, "utf-8"));
    expect(c.status).toBe("running");

    await c.shutdown();
    expect(c.status).toBe("shutdown");
    fs.rmSync(tmpDir2, { recursive: true, force: true });
  }, 15_000);
});

describe("LspClient missing server (bash)", () => {
  it("throws a clear error when the server binary does not exist", async () => {
    const bogusConfig: ServerConfig = {
      command: "nonexistent-language-server-that-should-never-exist",
      args: [],
      fileTypes: ["sh"],
      rootMarkers: [],
    };
    const bogusClient = new LspClient("bash", bogusConfig, tmpDir);
    await expect(bogusClient.start()).rejects.toThrow();
    expect(bogusClient.status).toBe("error");
  });
});
