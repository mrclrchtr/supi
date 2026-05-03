import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { getServerForFile, loadConfig } from "../src/config.ts";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lsp-config-test-"));
}

function withHomeDir<T>(homeDir: string, run: () => T): T {
  const prevHome = process.env.HOME;
  process.env.HOME = homeDir;
  try {
    return run();
  } finally {
    if (prevHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = prevHome;
    }
  }
}

describe("loadConfig", () => {
  it("loads defaults when no project config exists", () => {
    const config = loadConfig(os.tmpdir());
    expect(config.servers).toBeDefined();
    expect(config.servers.typescript).toBeDefined();
    expect(config.servers.python).toBeDefined();
    expect(config.servers.rust).toBeDefined();
    expect(config.servers.go).toBeDefined();
    expect(config.servers.c).toBeDefined();
    expect(config.servers.ruby).toBeDefined();
    expect(config.servers.java).toBeDefined();
    expect(config.servers.kotlin).toBeDefined();
  });

  it("merges project config overrides per language key", () => {
    const tmpDir = makeTmpDir();
    fs.mkdirSync(path.join(tmpDir, ".pi", "supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi", "supi", "config.json"),
      JSON.stringify({
        lsp: {
          servers: {
            typescript: { command: "vtsls" },
            zig: { command: "zls", args: [], fileTypes: ["zig"], rootMarkers: ["build.zig"] },
          },
        },
      }),
    );

    const config = loadConfig(tmpDir);
    expect(config.servers.typescript?.command).toBe("vtsls");
    // Omitted fields fall back to defaults
    expect(config.servers.typescript?.args).toEqual(["--stdio"]);
    expect(config.servers.typescript?.fileTypes).toContain("ts");
    // Custom language added
    expect(config.servers.zig).toBeDefined();
    expect(config.servers.zig?.command).toBe("zls");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("merges global config per language key", () => {
    const tmpDir = makeTmpDir();

    withHomeDir(tmpDir, () => {
      fs.mkdirSync(path.join(tmpDir, ".pi", "agent", "supi"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, ".pi", "agent", "supi", "config.json"),
        JSON.stringify({
          lsp: {
            servers: {
              python: { command: "pylsp" },
            },
          },
        }),
      );

      const config = loadConfig(tmpDir);
      expect(config.servers.python?.command).toBe("pylsp");
      expect(config.servers.python?.fileTypes).toContain("py");
    });

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("project overrides take precedence over global for same key", () => {
    const tmpDir = makeTmpDir();

    withHomeDir(tmpDir, () => {
      fs.mkdirSync(path.join(tmpDir, ".pi", "agent", "supi"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, ".pi", "agent", "supi", "config.json"),
        JSON.stringify({
          lsp: {
            servers: {
              typescript: { command: "global-ts-lsp", args: ["--global"] },
            },
          },
        }),
      );

      fs.mkdirSync(path.join(tmpDir, ".pi", "supi"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, ".pi", "supi", "config.json"),
        JSON.stringify({
          lsp: {
            servers: {
              typescript: { command: "project-ts-lsp" },
            },
          },
        }),
      );

      const config = loadConfig(tmpDir);
      expect(config.servers.typescript?.command).toBe("project-ts-lsp");
      // args was not overridden by project, so it should come from global
      expect(config.servers.typescript?.args).toEqual(["--global"]);
    });

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("project config can re-enable a server disabled globally", () => {
    const tmpDir = makeTmpDir();

    withHomeDir(tmpDir, () => {
      fs.mkdirSync(path.join(tmpDir, ".pi", "agent", "supi"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, ".pi", "agent", "supi", "config.json"),
        JSON.stringify({
          lsp: {
            servers: {
              typescript: { enabled: false },
            },
          },
        }),
      );

      fs.mkdirSync(path.join(tmpDir, ".pi", "supi"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, ".pi", "supi", "config.json"),
        JSON.stringify({
          lsp: {
            servers: {
              typescript: { enabled: true, command: "vtsls" },
            },
          },
        }),
      );

      const config = loadConfig(tmpDir);
      expect(config.servers.typescript).toBeDefined();
      expect(config.servers.typescript?.command).toBe("vtsls");
    });

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("removes disabled servers", () => {
    const tmpDir = makeTmpDir();
    fs.mkdirSync(path.join(tmpDir, ".pi", "supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi", "supi", "config.json"),
      JSON.stringify({
        lsp: {
          servers: {
            typescript: { enabled: false },
          },
        },
      }),
    );

    const config = loadConfig(tmpDir);
    expect(config.servers.typescript).toBeUndefined();
    expect(config.servers.python).toBeDefined();

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("rejects incomplete custom servers", () => {
    const tmpDir = makeTmpDir();
    fs.mkdirSync(path.join(tmpDir, ".pi", "supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi", "supi", "config.json"),
      JSON.stringify({
        lsp: {
          servers: {
            zig: { command: "zls" },
          },
        },
      }),
    );

    const config = loadConfig(tmpDir);
    expect(config.servers.zig).toBeUndefined();

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("ignores legacy .pi-lsp.json", () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, ".pi-lsp.json"),
      JSON.stringify({
        servers: {
          "legacy-server": { command: "legacy", fileTypes: ["legacy"], rootMarkers: ["legacy"] },
        },
      }),
    );

    const config = loadConfig(tmpDir);
    expect(config.servers["legacy-server"]).toBeUndefined();

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("resolves cpp alias to c when overriding", () => {
    const tmpDir = makeTmpDir();
    fs.mkdirSync(path.join(tmpDir, ".pi", "supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi", "supi", "config.json"),
      JSON.stringify({
        lsp: {
          servers: {
            cpp: { command: "custom-clangd" },
          },
        },
      }),
    );

    const config = loadConfig(tmpDir);
    expect(config.servers.c?.command).toBe("custom-clangd");
    expect(config.servers.cpp).toBeUndefined();

    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe("getServerForFile", () => {
  const config = loadConfig(os.tmpdir());

  it.each([
    ["src/index.ts", "typescript"],
    ["app.tsx", "typescript"],
    ["main.js", "typescript"],
    ["lib.py", "python"],
    ["main.rs", "rust"],
    ["main.go", "go"],
    ["app.c", "c"],
    ["app.cpp", "c"],
    ["app.rb", "ruby"],
    ["App.java", "java"],
    ["App.kt", "kotlin"],
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
