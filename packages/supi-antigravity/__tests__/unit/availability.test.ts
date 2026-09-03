import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Value } from "typebox/value";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  discoverAntigravityAvailability,
  intersectCuratedModels,
  isSupportedAntigravityVersion,
  parseAntigravityVersion,
  parseAvailableModels,
} from "../../src/availability.ts";
import { buildModelCatalogueEnum } from "../../src/catalogue.ts";
import { getIsolatedAntigravityPaths } from "../../src/isolated-home.ts";
import {
  buildAntigravityRunSchema,
  parseAntigravityRunInput,
} from "../../src/tool/antigravity_run/input.ts";

async function makePaths() {
  const agentDir = await mkdtemp(join(tmpdir(), "supi-antigravity-availability-"));
  await mkdir(agentDir, { recursive: true });
  return { agentDir, paths: getIsolatedAntigravityPaths(agentDir) };
}

describe("Antigravity availability", () => {
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(() => {
    cleanup = undefined;
  });

  it("parses versions and enforces the minimum", () => {
    expect(parseAntigravityVersion("agy 1.1.24\n")).toEqual({ major: 1, minor: 1, patch: 24 });
    expect(isSupportedAntigravityVersion({ major: 1, minor: 1, patch: 24 })).toBe(true);
    expect(isSupportedAntigravityVersion({ major: 1, minor: 1, patch: 23 })).toBe(false);
    expect(
      isSupportedAntigravityVersion({ major: 1, minor: 1, patch: 24, prerelease: "beta" }),
    ).toBe(false);
    expect(isSupportedAntigravityVersion({ major: 2, minor: 0, patch: 0 })).toBe(true);
  });

  it("parses bounded tab-separated model output and keeps curated order", () => {
    expect(
      parseAvailableModels(
        "Model\tDescription\ngemini-3.1-pro-high\tPro\ngemini-3.8-flash-low\tFlash",
      ),
    ).toEqual(["gemini-3.1-pro-high", "gemini-3.8-flash-low"]);
    expect(intersectCuratedModels(["gemini-3.1-pro-high", "other"])).toEqual([
      "gemini-3.1-pro-high",
    ]);
  });

  it("builds a schema that accepts only discovered models", () => {
    const model = buildModelCatalogueEnum(["gemini-3.8-flash-low"]);
    expect(Value.Check(model, "gemini-3.8-flash-low")).toBe(true);
    expect(Value.Check(model, "gemini-3.8-flash-high")).toBe(false);
  });

  it("discovers an immutable catalogue", async () => {
    const setup = await makePaths();
    cleanup = () => rm(setup.agentDir, { recursive: true, force: true });
    const runProbe = vi.fn(async (options: { args: string[] }) =>
      options.args[0] === "--version"
        ? { exitCode: 0, signal: null, stdout: "1.1.25", stderr: "" }
        : {
            exitCode: 0,
            signal: null,
            stdout: "model\ngemini-3.8-flash-medium\tFlash",
            stderr: "",
          },
    );
    const result = await discoverAntigravityAvailability({ paths: setup.paths, runProbe });
    expect(result).toEqual({
      status: "available",
      cliVersion: "1.1.25",
      catalogue: ["gemini-3.8-flash-medium"],
    });
    if (result.status !== "available") throw new Error("expected available result");
    expect(Object.isFrozen(result.catalogue)).toBe(true);
    expect(runProbe).toHaveBeenCalledTimes(2);
    await cleanup();
    cleanup = undefined;
  });

  it("reports authentication and old-version availability failures", async () => {
    const setup = await makePaths();
    const authenticated = await discoverAntigravityAvailability({
      paths: setup.paths,
      runProbe: vi.fn(async (options: { args: string[] }) =>
        options.args[0] === "--version"
          ? { exitCode: 0, signal: null, stdout: "1.1.25", stderr: "" }
          : {
              exitCode: 1,
              signal: null,
              stdout: "",
              stderr: "Please sign in to view available models.",
            },
      ),
    });
    expect(authenticated).toMatchObject({ status: "unavailable", reason: "authentication" });
    if (authenticated.status === "unavailable") expect(authenticated.warning).toContain("HOME=");

    const old = await discoverAntigravityAvailability({
      paths: setup.paths,
      runProbe: vi.fn(async () => ({
        exitCode: 0,
        signal: null,
        stdout: "agy 1.1.23",
        stderr: "",
      })),
    });
    expect(old).toMatchObject({ status: "unavailable", reason: "old-version" });
    await rm(setup.agentDir, { recursive: true, force: true });
  });

  it("requires exactly one new or continue branch", () => {
    const catalogue = ["gemini-3.8-flash-low"] as const;
    expect(
      parseAntigravityRunInput(
        { prompt: "x", new: { workspace: false, model: catalogue[0] } },
        catalogue,
      ),
    ).toEqual({
      prompt: "x",
      new: { workspace: false, model: catalogue[0] },
    });
    expect(() => parseAntigravityRunInput({ prompt: "x" }, catalogue)).toThrow(/exactly one/);
    expect(() =>
      parseAntigravityRunInput(
        { prompt: "x", new: { workspace: false, model: catalogue[0] }, continue: { handle: "h" } },
        catalogue,
      ),
    ).toThrow();
    const schema = buildAntigravityRunSchema(catalogue);
    expect(
      Value.Check(schema, {
        prompt: "x",
        new: { workspace: false, model: catalogue[0] },
        continue: { handle: "h" },
      }),
    ).toBe(false);
  });
});
