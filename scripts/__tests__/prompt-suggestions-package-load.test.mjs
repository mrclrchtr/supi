import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { sanitizeNpmEnv } from "../npm-env.mjs";
import { packStaged } from "../pack-staged.mjs";

const scratchDirectories = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("loads packed prompt suggestions through Pi without a local Pi AI install", {
  timeout: 120_000,
}, async () => {
  const scratch = mkdtempSync(join(tmpdir(), "supi-suggestions-load-"));
  scratchDirectories.push(scratch);
  const outDir = join(scratch, "packs");
  mkdirSync(outDir);
  const tarball = await packStaged(resolve("packages/supi-prompt-suggestions"), { outDir });
  execFileSync(
    "npm",
    ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    {
      cwd: scratch,
      env: sanitizeNpmEnv(),
      timeout: 60_000,
      stdio: "pipe",
    },
  );
  const packageRoot = join(scratch, "node_modules/@mrclrchtr/supi-prompt-suggestions");
  const packageRequire = createRequire(join(packageRoot, "package.json"));
  expect(() => packageRequire.resolve("@earendil-works/pi-ai")).toThrow();

  // Use the host loader, but keep the extension outside workspace module roots.
  const probe = `
    import { discoverAndLoadExtensions } from ${JSON.stringify(import.meta.resolve("@earendil-works/pi-coding-agent"))};
    const loaded = await discoverAndLoadExtensions(
      [${JSON.stringify(packageRoot)}], process.cwd(), ${JSON.stringify(join(scratch, "agent"))}
    );
    console.log(JSON.stringify({
      errors: loaded.errors,
      handlers: loaded.extensions.map((extension) => [...extension.handlers.keys()]),
    }));
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
    cwd: scratch,
    env: { ...process.env, NODE_PATH: "", PI_CODING_AGENT_DIR: join(scratch, "agent") },
    encoding: "utf8",
    timeout: 60_000,
  });
  const result = JSON.parse(output.trim());
  expect(result.errors).toEqual([]);
  expect(result.handlers).toEqual([
    expect.arrayContaining(["session_start", "agent_settled", "agent_start", "session_shutdown"]),
  ]);
});
