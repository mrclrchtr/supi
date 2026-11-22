import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { executePlan } from "../../src/execution.mjs";
import { createContext, readInventory } from "../../src/inventory.mjs";
import { createMatrix, getPlan, toggleCell } from "../../src/matrix.mjs";
import { createPiRunner } from "../../src/process.mjs";
import { fixture, writeJson } from "../helpers/fixture.js";

const roots: string[] = [];
function setup(env: NodeJS.ProcessEnv = {}) {
  const files = fixture();
  roots.push(files.root);
  writeJson(join(files.agentDir, "settings.json"), {
    packages: ["npm:@mrclrchtr/supi-web@8"],
    retained: true,
  });
  const inventory = readInventory(createContext(files));
  const runner = createPiRunner({
    command: process.execPath,
    prefix: [fileURLToPath(new URL("../fixtures/pi.mjs", import.meta.url))],
    env: { ...process.env, ...env, PI_CODING_AGENT_DIR: files.agentDir },
  });
  const matrix = createMatrix(inventory);
  const web = matrix.rows.findIndex((row) => row.item.name === "supi-web");
  toggleCell(matrix, web, "project");
  toggleCell(matrix, web, "global");
  return { ...files, inventory, runner, plan: getPlan(matrix) };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Pi execution boundary", () => {
  it("adds before removing, preserves other settings, and never grants trust", async () => {
    const { inventory, runner, plan, agentDir, project } = setup();
    const report = await executePlan(inventory, plan, { runner });
    expect(report.ok).toBe(true);
    expect(report.inventory?.entries).toEqual({ global: [], project: ["npm:@mrclrchtr/supi-web"] });
    expect(JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8")).retained).toBe(true);
    const calls = readFileSync(join(agentDir, "calls.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(calls).toEqual([
      { args: ["install", "npm:@mrclrchtr/supi-web", "--local"], cwd: project },
      { args: ["remove", "npm:@mrclrchtr/supi-web@8"], cwd: project },
    ]);
  });

  it("still removes the source after a failed destination install", async () => {
    const { inventory, runner, plan } = setup();
    const report = await executePlan(inventory, plan, {
      runner: async (args, options) =>
        args[0] === "install" ? { code: 1, output: "offline" } : runner(args, options),
    });
    expect(report.ok).toBe(false);
    expect(report.results.map((result) => result.status)).toEqual(["failed", "success"]);
    expect(report.inventory?.entries).toEqual({ project: [], global: [] });
  });

  it("refuses a stale review without running commands", async () => {
    const { inventory, runner, plan, agentDir } = setup();
    writeJson(join(agentDir, "settings.json"), { changed: true });
    const report = await executePlan(inventory, plan, { runner });
    expect(report.error).toMatch(/changed/);
    expect(report.results.every((result) => result.status === "unattempted")).toBe(true);
  });

  it("stops after an external edit during execution", async () => {
    const { inventory, runner, plan, agentDir } = setup();
    const report = await executePlan(inventory, plan, {
      runner: async (args, options) => {
        const result = await runner(args, options);
        writeJson(join(agentDir, "settings.json"), { external: true });
        return result;
      },
    });
    expect(report.ok).toBe(false);
    expect(report.error).toMatch(/changed/);
    expect(report.results[1]?.status).toBe("unattempted");
  });

  it("cancels an active child and does not start a removal", async () => {
    const { inventory, runner, plan } = setup({ FIXTURE_WAIT: "1" });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100);
    const report = await executePlan(inventory, plan, { runner, signal: controller.signal });
    clearTimeout(timer);
    expect(report.cancelled).toBe(true);
    expect(report.results[1]?.status).toBe("unattempted");
  });
});
