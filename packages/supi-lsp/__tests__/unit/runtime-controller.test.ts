import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLspSettings } from "../../src/config/lsp-settings.ts";
import { LspRuntimeController } from "../../src/session/runtime-controller.ts";
import { getWorkspaceLspRuntime } from "../../src/session/runtime-registry.ts";

const TMP_DIRS: string[] = [];

function makeProjectDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-runtime-test-"));
  TMP_DIRS.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of TMP_DIRS) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Already cleaned up
    }
  }
  TMP_DIRS.length = 0;
});

// ── lsp-settings (config helpers) ─────────────────────────────

describe("loadLspSettings", () => {
  it("returns defaults when no config exists", () => {
    const tmpDir = makeProjectDir();
    expect(loadLspSettings(tmpDir, tmpDir)).toEqual({ exclude: [] });
  });

  it("reads project exclusion patterns", () => {
    const tmpDir = makeProjectDir();
    fs.mkdirSync(path.join(tmpDir, ".pi", "supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi", "supi", "config.json"),
      JSON.stringify({ lsp: { exclude: ["**/*.test.ts"] } }),
    );

    expect(loadLspSettings(tmpDir).exclude).toEqual(["**/*.test.ts"]);
  });
});

// ── Runtime controller ────────────────────────────────────────

describe("LspRuntimeController", () => {
  it("creates a controller that can be started and shut down", async () => {
    const tmpDir = makeProjectDir();

    const controller = new LspRuntimeController(tmpDir);
    expect(controller.cwd).toBe(tmpDir);
    expect(controller.kind).toBe("initial");

    // Shutdown without start should be safe
    await controller.shutdown();
  });

  it("still respects per-language lsp.servers.<lang>.enabled: false", async () => {
    // Per-language disable remains the supported way to opt out.
    const tmpDir = makeProjectDir();
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

    const controller = new LspRuntimeController(tmpDir);
    const result = await controller.start();
    // Should not be disabled — per-language disable still allows other servers
    expect(result.kind).not.toBe("disabled");
    expect(["ready", "unavailable"]).toContain(result.kind);
  });

  it("publishes disabled when every language-server route is disabled", async () => {
    const tmpDir = makeProjectDir();
    const languages = [
      "bash",
      "c",
      "go",
      "html",
      "java",
      "kotlin",
      "python",
      "r",
      "ruby",
      "rust",
      "sql",
      "typescript",
    ];
    fs.mkdirSync(path.join(tmpDir, ".pi", "supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi", "supi", "config.json"),
      JSON.stringify({
        lsp: {
          servers: Object.fromEntries(languages.map((language) => [language, { enabled: false }])),
        },
      }),
    );

    const controller = new LspRuntimeController(tmpDir);
    const result = await controller.start();

    expect(result).toEqual({
      kind: "disabled",
      message: "All language servers are disabled by configuration.",
    });
    expect(controller.kind).toBe("disabled");
    expect(controller.workspaceRuntime).toBeNull();
    expect(getWorkspaceLspRuntime(tmpDir)).toEqual({ kind: "disabled" });
    await controller.shutdown();
  });

  it("exposes only the workspace runtime in ready state after start", async () => {
    const tmpDir = makeProjectDir();
    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "test-project" }));

    const controller = new LspRuntimeController(tmpDir);
    const result = await controller.start();

    if (result.kind === "ready") {
      expect(controller.kind).toBe("ready");
      expect(controller.workspaceRuntime).toBe(result.runtime);
      expect(controller.projectServers).toBeDefined();
      expect(controller).not.toHaveProperty("manager");
    }
    // In CI without any language servers, it may be "unavailable" or "ready" with no servers
    // Either is valid — we just test the shape
    expect(["ready", "unavailable", "disabled"]).toContain(result.kind);
  }, 10000);
});
