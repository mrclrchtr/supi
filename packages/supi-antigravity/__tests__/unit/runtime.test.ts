import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSupiConfig } from "@mrclrchtr/supi-core/config";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getIsolatedAntigravityPaths } from "../../src/isolated-home.ts";
import { AntigravityRuntime } from "../../src/runtime.ts";

const roots: string[] = [];

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "supi-antigravity-runtime-test-"));
  roots.push(root);
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Antigravity runtime activation", () => {
  it("does not let an older discovery activate after disable", async () => {
    const root = roots[0] as string;
    const cwd = join(root, "repo");
    await mkdir(cwd, { recursive: true });
    const first = deferred<{
      status: "available";
      cliVersion: string;
      catalogue: readonly ["gemini-3.8-flash-low"];
    }>();
    const discover = vi.fn(async () => first.promise);
    const pi = createPiMock();
    const runtime = new AntigravityRuntime({
      pi: pi as never,
      paths: getIsolatedAntigravityPaths(root),
      homeDir: root,
      discover: discover as never,
    });
    const context = makeCtx({ cwd });
    const refreshing = runtime.refresh(cwd, { ui: context.ui });
    writeSupiConfig(
      { section: "antigravity", scope: "project", cwd },
      { agentToolEnabled: false },
      { homeDir: root },
    );
    await runtime.refresh(cwd, { ui: context.ui });
    first.resolve({
      status: "available",
      cliVersion: "1.1.25",
      catalogue: ["gemini-3.8-flash-low"],
    });
    await refreshing;
    expect(pi.tools).toHaveLength(0);
    expect(pi.getActiveTools()).not.toContain("antigravity_run");
  });
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}
