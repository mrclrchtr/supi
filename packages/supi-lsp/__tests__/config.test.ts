import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { getServerForFile, loadConfig } from "../config.ts";

describe("loadConfig", () => {
  it("loads defaults when no project config exists", () => {
    const config = loadConfig(os.tmpdir());
    expect(config.servers).toBeDefined();
    expect(config.servers["typescript-language-server"]).toBeDefined();
    expect(config.servers["rust-analyzer"]).toBeDefined();
    expect(config.servers.pyright).toBeDefined();
    expect(config.servers.gopls).toBeDefined();
    expect(config.servers.clangd).toBeDefined();
  });

  it("merges project config overrides", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-test-"));
    fs.writeFileSync(
      path.join(tmpDir, ".pi-lsp.json"),
      JSON.stringify({
        servers: {
          "typescript-language-server": { enabled: false },
          "custom-server": {
            command: "custom-lsp",
            args: ["--stdio"],
            fileTypes: ["xyz"],
            rootMarkers: ["custom.config"],
          },
        },
      }),
    );

    const config = loadConfig(tmpDir);
    expect(config.servers["typescript-language-server"]).toBeUndefined();
    expect(config.servers["custom-server"]).toBeDefined();
    expect(config.servers["custom-server"].command).toBe("custom-lsp");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("respects PI_LSP_SERVERS allow-list", () => {
    const original = process.env.PI_LSP_SERVERS;
    process.env.PI_LSP_SERVERS = "rust-analyzer,pyright";

    const config = loadConfig(os.tmpdir());
    expect(config.servers["rust-analyzer"]).toBeDefined();
    expect(config.servers.pyright).toBeDefined();
    expect(config.servers["typescript-language-server"]).toBeUndefined();
    expect(config.servers.gopls).toBeUndefined();

    if (original === undefined) {
      delete process.env.PI_LSP_SERVERS;
    } else {
      process.env.PI_LSP_SERVERS = original;
    }
  });
});

describe("getServerForFile", () => {
  const config = loadConfig(os.tmpdir());

  it.each([
    ["src/index.ts", "typescript-language-server"],
    ["app.tsx", "typescript-language-server"],
    ["main.js", "typescript-language-server"],
    ["lib.py", "pyright"],
    ["main.rs", "rust-analyzer"],
    ["main.go", "gopls"],
    ["app.c", "clangd"],
    ["app.cpp", "clangd"],
  ])("maps %s to %s", (file, serverName) => {
    const result = getServerForFile(config, file);
    expect(result).not.toBeNull();
    expect(result?.[0]).toBe(serverName);
  });

  it("returns null for unknown extensions", () => {
    expect(getServerForFile(config, "readme.txt")).toBeNull();
  });

  it("returns null for files without extension", () => {
    expect(getServerForFile(config, "Makefile")).toBeNull();
  });
});
