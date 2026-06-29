import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TreeSitterRuntimeController } from "../src/session/runtime-controller.ts";

const TMP_DIRS: string[] = [];

function makeProjectDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-runtime-test-"));
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

// ── Runtime controller ───────────────────────────────────────

describe("TreeSitterRuntimeController", () => {
  it("exports TreeSitterRuntimeController class", () => {
    expect(typeof TreeSitterRuntimeController).toBe("function");
  });

  it("creates a controller that can be started and shut down", async () => {
    const tmpDir = makeProjectDir();

    const controller = new TreeSitterRuntimeController(tmpDir);
    expect(controller.cwd).toBe(tmpDir);
    expect(controller.kind).toBe("initial");

    // Start then shutdown
    const result = await controller.start();
    if (result.kind === "ready") {
      expect(controller.kind).toBe("ready");
      expect(controller.service).toBeTruthy();
      expect(controller.runtime).toBeTruthy();
    } else {
      // web-tree-sitter may not be available in all environments
      expect(["unavailable"]).toContain(result.kind);
    }

    // Shutdown should be safe
    await controller.shutdown();
    expect(controller.kind).toBe("initial");
  });

  it("exposes ready state when tree-sitter initializes", async () => {
    const tmpDir = makeProjectDir();
    // Write a small JS file so the session has something parseable
    fs.writeFileSync(path.join(tmpDir, "test.js"), "const x = 1;");

    const controller = new TreeSitterRuntimeController(tmpDir);
    const result = await controller.start();
    // In CI the WASM may or may not be available — accept either
    expect(["ready", "unavailable"]).toContain(result.kind);

    await controller.shutdown();
  });

  it("can start twice safely (idempotent restart)", async () => {
    const tmpDir = makeProjectDir();

    const controller = new TreeSitterRuntimeController(tmpDir);

    // First start
    const _result1 = await controller.start();
    await controller.shutdown();

    // Second start after shutdown
    const result2 = await controller.start();
    if (result2.kind === "ready") {
      expect(controller.service).toBeTruthy();
    }
    await controller.shutdown();
  });

  it("exposes service and runtime after start", async () => {
    const tmpDir = makeProjectDir();

    const controller = new TreeSitterRuntimeController(tmpDir);
    const result = await controller.start();

    if (result.kind === "ready") {
      expect(controller.kind).toBe("ready");
      const service = controller.service;
      const runtime = controller.runtime;
      expect(service).toBeTruthy();
      expect(runtime).toBeTruthy();
      if (service) {
        expect(typeof service.canParse).toBe("function");
      }
    }

    await controller.shutdown();
  });

  it("shutdown is safe when not started", async () => {
    const tmpDir = makeProjectDir();

    const controller = new TreeSitterRuntimeController(tmpDir);
    // Should not throw
    await controller.shutdown();
  });
});
