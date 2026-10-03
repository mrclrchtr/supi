import { fork } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = join(packageRoot, "__tests__/fixtures/disconnected-process-host-parent.mjs");

describe("Structural Worker process host lifecycle", () => {
  it("stops startup when the parent is already disconnected", async () => {
    const child = fork(fixturePath, [packageRoot, "1"], {
      execArgv: [],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    if (child.pid === undefined) throw new Error("Could not start the process-host fixture");

    const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolveClose) => child.once("close", (code, signal) => resolveClose({ code, signal })),
    );
    const outcome = await Promise.race([closed, delay(1_500).then(() => null)]);
    if (outcome === null) {
      child.kill("SIGKILL");
      await closed;
    }

    expect(outcome).not.toBeNull();
    expect(outcome?.signal).toBeNull();
  }, 3_000);
});

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
