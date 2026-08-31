import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
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
      // Already cleaned up.
    }
  }
  TMP_DIRS.length = 0;
});

describe("TreeSitterRuntimeController", () => {
  it("publishes and clears the structural provider through WorkspaceRuntime", async () => {
    const cwd = makeProjectDir();
    fs.writeFileSync(path.join(cwd, "test.ts"), "export const value = 1;\n");
    const runtime = new WorkspaceRuntime();
    const controller = new TreeSitterRuntimeController(cwd, runtime);

    await expect(controller.start()).resolves.toEqual({ kind: "ready" });
    expect(controller.kind).toBe("ready");

    const published = runtime.getWorkspace(cwd).structural;
    expect(published.state).toEqual({ kind: "ready" });
    expect(published.provider).not.toBeNull();
    if (published.provider) {
      await expect(published.provider.outline("test.ts")).resolves.toMatchObject({
        kind: "success",
        data: [expect.objectContaining({ name: "value" })],
      });
    }

    await controller.shutdown();

    expect(runtime.getWorkspace(cwd).structural).toEqual({
      state: { kind: "unavailable", reason: "No provider registered for this workspace" },
      provider: null,
    });
    expect(controller.kind).toBe("initial");
  });
});
