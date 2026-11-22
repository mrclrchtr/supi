import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { delimiter, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { createPiRunner, requirePi } from "../../src/process.mjs";
import { fixture, waitForFile, writePiShim } from "../helpers/fixture.js";

const roots: string[] = [];

it("cancels an active version preflight through the command boundary", {
  timeout: 10_000,
}, async () => {
  const files = fixture();
  roots.push(files.root);
  const command = writePiShim(
    join(files.root, "bin"),
    fileURLToPath(new URL("../fixtures/pi.mjs", import.meta.url)),
  );
  const runner = createPiRunner({
    command,
    env: { ...process.env, PI_CODING_AGENT_DIR: files.agentDir, FIXTURE_VERSION_WAIT: "1" },
  });
  const controller = new AbortController();
  const pending = requirePi(runner, files.project, controller.signal);
  const rejected = expect(pending).rejects.toThrow(/Cancelled/);
  await waitForFile(join(files.agentDir, "version-ready"));
  controller.abort();
  await rejected;
});
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("cancels the command tree through an npm-style Pi shim", { timeout: 10_000 }, async () => {
  const files = fixture();
  roots.push(files.root);
  const command = writePiShim(
    join(files.root, "bin"),
    fileURLToPath(new URL("../fixtures/tree.mjs", import.meta.url)),
  );
  const runner = createPiRunner({
    command,
    env: { ...process.env, PI_CODING_AGENT_DIR: files.agentDir },
  });
  const controller = new AbortController();
  const pending = runner(["install", "npm:@mrclrchtr/supi-web"], {
    cwd: files.project,
    signal: controller.signal,
  });
  await waitForFile(join(files.agentDir, "descendant-ready"));
  controller.abort();
  const result = await pending;
  expect(result.code).toBe(130);
  await delay(800);
  expect(existsSync(join(files.agentDir, "orphan-write"))).toBe(false);
});

it.skipIf(process.platform === "win32")(
  "propagates process cancellation through the Pi version preflight",
  { timeout: 10_000 },
  async () => {
    const files = fixture();
    roots.push(files.root);
    const bin = join(files.root, "bin");
    writePiShim(bin, fileURLToPath(new URL("../fixtures/pi.mjs", import.meta.url)));
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../../bin/supi-installer.mjs", import.meta.url)), "--dry-run"],
      {
        cwd: files.project,
        env: {
          ...process.env,
          PI_CODING_AGENT_DIR: files.agentDir,
          FIXTURE_VERSION_WAIT: "1",
          PATH: `${bin}${delimiter}${process.env.PATH}`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let text = "";
    child.stdout.on("data", (chunk) => {
      text += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      text += chunk.toString();
    });
    const closed = new Promise<number | null>((resolve, reject) => {
      child.once("close", resolve);
      child.once("error", reject);
    });
    await waitForFile(join(files.agentDir, "version-ready"));
    child.kill("SIGTERM");
    expect(await closed).toBe(130);
    expect(text).toContain("Cancelled");
  },
);
