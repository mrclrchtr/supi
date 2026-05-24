/**
 * RED tests for the LSP runtime controller contract.
 *
 * These tests describe the stable library-level API that the
 * umbrella extension adapter will consume. They will fail until
 * the controller is implemented.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { clearRegisteredSettings } from "@mrclrchtr/supi-core/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadLspSettings } from "../../src/config/lsp-settings.ts";
import { clearTsconfigCache } from "../../src/config/tsconfig-scope.ts";
import { LspRuntimeController } from "../../src/session/runtime-controller.ts";
import { getSessionLspService, SessionLspService } from "../../src/session/service-registry.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lsp-controller-test-"));
}

function _withHomeDir<T>(homeDir: string, run: () => T): T {
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

describe("LspRuntimeController", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    clearRegisteredSettings();
    clearTsconfigCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    clearRegisteredSettings();
    clearTsconfigCache();
  });

  describe("start when LSP is enabled (default)", () => {
    it("creates a manager and publishes a ready service state", async () => {
      const controller = new LspRuntimeController();
      const result = await controller.start(tmpDir);

      expect(result.kind).toBe("ready");
      if (result.kind !== "ready") return;

      expect(result.manager).toBeDefined();
      expect(result.service).toBeInstanceOf(SessionLspService);
      expect(result.detectedServers).toBeDefined();
      expect(Array.isArray(result.projectServers)).toBe(true);
      expect(Array.isArray(result.missing)).toBe(true);

      // Verify the session-scoped state is published
      const state = getSessionLspService(tmpDir);
      expect(state.kind).toBe("ready");
      if (state.kind === "ready") {
        expect(state.service).toBeInstanceOf(SessionLspService);
      }

      await controller.stop();
    });
  });

  describe("start when LSP is disabled", () => {
    it("returns disabled kind and publishes disabled state", async () => {
      // Write project config with LSP disabled
      const supiconfigDir = path.join(tmpDir, ".pi", "supi");
      fs.mkdirSync(supiconfigDir, { recursive: true });
      fs.writeFileSync(
        path.join(supiconfigDir, "config.json"),
        JSON.stringify({ lsp: { enabled: false } }),
      );

      const controller = new LspRuntimeController();
      const result = await controller.start(tmpDir);

      expect(result.kind).toBe("disabled");

      const state = getSessionLspService(tmpDir);
      expect(state.kind).toBe("disabled");
    });
  });

  describe("start on a second cwd", () => {
    it("shuts down the previous manager before starting the new one", async () => {
      const controller = new LspRuntimeController();

      const resultA = await controller.start(tmpDir);
      expect(resultA.kind).toBe("ready");
      if (resultA.kind !== "ready") return;

      const managerA = resultA.manager;

      // Start on a different directory
      const dirB = makeTempDir();
      try {
        const resultB = await controller.start(dirB);
        expect(resultB.kind).toBe("ready");
        if (resultB.kind !== "ready") return;

        // Manager should be a new instance
        expect(resultB.manager).not.toBe(managerA);

        // Old cwd state should not be ready
        const oldState = getSessionLspService(tmpDir);
        expect(oldState.kind).not.toBe("ready");
      } finally {
        fs.rmSync(dirB, { recursive: true, force: true });
        await controller.stop();
      }
    });
  });

  describe("stop", () => {
    it("shuts down the manager and clears the session state", async () => {
      const controller = new LspRuntimeController();
      await controller.start(tmpDir);

      expect(getSessionLspService(tmpDir).kind).toBe("ready");

      await controller.stop();

      // State should no longer be ready
      const state = getSessionLspService(tmpDir);
      expect(state.kind).not.toBe("ready");
    });

    it("is safe to call without a prior start", async () => {
      const controller = new LspRuntimeController();
      await expect(controller.stop()).resolves.not.toThrow();
    });
  });

  describe("properties after start", () => {
    it("exposes manager and cwd", async () => {
      const controller = new LspRuntimeController();
      await controller.start(tmpDir);

      expect(controller.cwd).toBe(tmpDir);
      expect(controller.manager).toBeDefined();

      await controller.stop();

      expect(controller.manager).toBeNull();
      expect(controller.cwd).toBeNull();
    });
  });
});

describe("loadLspSettings from config/lsp-settings (new library surface)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config exists", () => {
    const result = loadLspSettings(tmpDir, tmpDir);
    expect(result).toEqual({ enabled: true, severity: 1, active: [], exclude: [] });
  });

  it("reads global config when project config is absent", () => {
    const globalDir = makeTempDir();
    try {
      const globalConf = path.join(globalDir, ".pi", "agent", "supi");
      fs.mkdirSync(globalConf, { recursive: true });
      fs.writeFileSync(
        path.join(globalConf, "config.json"),
        JSON.stringify({ lsp: { severity: 3 } }),
      );

      const result = loadLspSettings(tmpDir, globalDir);
      expect(result.severity).toBe(3);
      expect(result.enabled).toBe(true);
    } finally {
      fs.rmSync(globalDir, { recursive: true, force: true });
    }
  });

  it("merges project overrides over global", () => {
    const globalDir = makeTempDir();
    try {
      const globalConf = path.join(globalDir, ".pi", "agent", "supi");
      fs.mkdirSync(globalConf, { recursive: true });
      fs.writeFileSync(
        path.join(globalConf, "config.json"),
        JSON.stringify({ lsp: { severity: 2, exclude: ["*.test.ts"] } }),
      );

      const projectConf = path.join(tmpDir, ".pi", "supi");
      fs.mkdirSync(projectConf, { recursive: true });
      fs.writeFileSync(
        path.join(projectConf, "config.json"),
        JSON.stringify({ lsp: { severity: 4 } }),
      );

      const result = loadLspSettings(tmpDir, globalDir);
      expect(result.severity).toBe(4); // project wins
      expect(result.exclude).toEqual(["*.test.ts"]); // from global
    } finally {
      fs.rmSync(globalDir, { recursive: true, force: true });
    }
  });
});
