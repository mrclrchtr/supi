import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { fixture, writeJson } from "../helpers/fixture.js";

const executable = fileURLToPath(new URL("../../bin/supi-installer.mjs", import.meta.url));
const fakePi = fileURLToPath(new URL("../fixtures/pi.mjs", import.meta.url));
const roots: string[] = [];
function setup() {
  const files = fixture();
  roots.push(files.root);
  const bin = join(files.root, "bin");
  mkdirSync(bin);
  if (process.platform === "win32")
    writeFileSync(join(bin, "pi.cmd"), `@"${process.execPath}" "${fakePi}" %*\r\n`);
  else {
    writeFileSync(
      join(bin, "pi"),
      `#!/usr/bin/env node\nimport ${JSON.stringify(pathToFileURL(fakePi).href)};\n`,
    );
    chmodSync(join(bin, "pi"), 0o755);
  }
  const env = {
    ...process.env,
    PI_CODING_AGENT_DIR: files.agentDir,
    PATH: `${bin}${delimiter}${process.env.PATH}`,
  };
  const run = (args: string[], overrides: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, [executable, ...args], {
      cwd: files.project,
      env: { ...env, ...overrides },
      encoding: "utf8",
    });
  return { ...files, run };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("standalone CLI", () => {
  it("shows help and version without project trust", () => {
    const { run, agentDir } = setup();
    writeJson(join(agentDir, "trust.json"), {});
    expect(run(["--help"]).stdout).toContain("--project");
    const manifest = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    );
    expect(run(["--version"]).stdout.trim()).toBe(manifest.version);
  });

  it("prints a dry run without changing settings or trust", () => {
    const { run, agentDir } = setup();
    writeJson(join(agentDir, "settings.json"), {
      packages: [{ source: "npm:@mrclrchtr/supi-web@8", extensions: [] }],
    });
    const path = join(agentDir, "trust.json");
    const before = readFileSync(path, "utf8");
    const result = run(["--dry-run"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("npm:@mrclrchtr/supi-web@8");
    expect(result.stdout).toContain("filtered");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("rejects missing trust, missing Pi, non-terminal use, and mutation flags", () => {
    const { run, agentDir } = setup();
    expect(run([]).stderr).toMatch(/terminal/);
    expect(run(["--yes"]).status).toBe(1);
    expect(run(["--dry-run"], { PATH: "" }).stderr).toContain("PATH");
    writeJson(join(agentDir, "trust.json"), {});
    expect(run(["--dry-run"]).stderr).toContain("/trust");
  });
});
