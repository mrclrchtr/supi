import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getLspDisabledMessage, loadLspSettings } from "../../src/config/lsp-settings.ts";
import { LspRuntimeController } from "../../src/session/runtime-controller.ts";

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

describe("loadLspSettings (from new lsp-settings module)", () => {
  it("exports LspSettings type and helpers", () => {
    expect(typeof loadLspSettings).toBe("function");
    expect(typeof getLspDisabledMessage).toBe("function");
  });

  it("returns defaults when no config exists", () => {
    const tmpDir = makeProjectDir();
    const result = loadLspSettings(tmpDir, tmpDir);
    expect(result).toEqual({ enabled: true, severity: 1, active: [], exclude: [] });
  });

  it("reads from project .pi/supi config", () => {
    const tmpDir = makeProjectDir();
    fs.mkdirSync(path.join(tmpDir, ".pi", "supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi", "supi", "config.json"),
      JSON.stringify({ lsp: { enabled: false, severity: 2 } }),
    );

    const result = loadLspSettings(tmpDir);
    expect(result.enabled).toBe(false);
    expect(result.severity).toBe(2);
  });
});

describe("getLspDisabledMessage (from lsp-settings module)", () => {
  it("returns project-scope message when project disables LSP", () => {
    const tmpDir = makeProjectDir();
    fs.mkdirSync(path.join(tmpDir, ".pi", "supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi", "supi", "config.json"),
      JSON.stringify({ lsp: { enabled: false } }),
    );

    const msg = getLspDisabledMessage(tmpDir, tmpDir);
    expect(msg).toContain("project");
    expect(msg).not.toContain("global");
  });

  it("returns global-scope message when only global disables LSP", () => {
    const tmpDir = makeProjectDir();
    // Project config does not disable
    // Global config disables
    const globalDir = path.join(tmpDir, "global-config");
    fs.mkdirSync(path.join(globalDir, ".pi", "agent", "supi"), { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, ".pi", "agent", "supi", "config.json"),
      JSON.stringify({ lsp: { enabled: false } }),
    );

    // Ensure project has no disable
    fs.mkdirSync(path.join(tmpDir, ".pi", "supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi", "supi", "config.json"),
      JSON.stringify({ lsp: { enabled: true } }),
    );

    const msg = getLspDisabledMessage(tmpDir, globalDir);
    expect(msg).toContain("global");
  });
});

// ── Runtime controller ────────────────────────────────────────

describe("LspRuntimeController", () => {
  it("exports LspRuntimeController class", () => {
    expect(typeof LspRuntimeController).toBe("function");
  });

  it("creates a controller that can be started and shut down", async () => {
    const tmpDir = makeProjectDir();

    const controller = new LspRuntimeController(tmpDir);
    expect(controller.cwd).toBe(tmpDir);
    expect(controller.kind).toBe("initial");

    // Shutdown without start should be safe
    await controller.shutdown();
  });

  it("returns disabled state when LSP is configured off", async () => {
    const tmpDir = makeProjectDir();
    fs.mkdirSync(path.join(tmpDir, ".pi", "supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi", "supi", "config.json"),
      JSON.stringify({ lsp: { enabled: false } }),
    );

    const controller = new LspRuntimeController(tmpDir);
    const result = await controller.start();
    expect(result.kind).toBe("disabled");
    if (result.kind !== "disabled") {
      throw new Error("Expected disabled result");
    }
    expect(result.message.length).toBeGreaterThan(0);
    expect(controller.kind).toBe("disabled");
  });

  it("exposes manager and service in ready state after start", async () => {
    const tmpDir = makeProjectDir();
    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "test-project" }));

    const controller = new LspRuntimeController(tmpDir);
    const result = await controller.start();

    if (result.kind === "ready") {
      expect(controller.kind).toBe("ready");
      expect(controller.manager).toBeTruthy();
      expect(controller.service).toBeTruthy();
      expect(controller.projectServers).toBeDefined();
    }
    // In CI without any language servers, it may be "unavailable" or "ready" with no servers
    // Either is valid — we just test the shape
    expect(["ready", "unavailable", "disabled"]).toContain(result.kind);
  }, 10000);
});
