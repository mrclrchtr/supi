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
} from "../../src/agents/antigravity/availability.ts";
import { getIsolatedAntigravityPaths } from "../../src/agents/antigravity/isolated-home.ts";
import { buildModelCatalogueEnum } from "../../src/catalogue.ts";
import {
  buildConsultingRunSchema,
  parseConsultingRunInput,
} from "../../src/tool/consulting_run/input.ts";

async function makePaths() {
  const agentDir = await mkdtemp(join(tmpdir(), "supi-consulting-availability-"));
  await mkdir(agentDir, { recursive: true });
  return { agentDir, paths: getIsolatedAntigravityPaths(agentDir) };
}

describe("Antigravity adapter availability", () => {
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

  it("parses bounded model output and keeps the curated order", () => {
    expect(
      parseAvailableModels(
        "Model\tDescription\ngemini-3.1-pro-high\tPro\ngemini-3.8-flash-low\tFlash",
      ),
    ).toEqual(["gemini-3.1-pro-high", "gemini-3.8-flash-low"]);
    expect(intersectCuratedModels(["gemini-3.1-pro-high", "other"])).toEqual([
      "gemini-3.1-pro-high",
    ]);
  });

  it("builds a model enum from any agent-neutral identifier", () => {
    const model = buildModelCatalogueEnum(["local-model-v2"]);
    expect(Value.Check(model, "local-model-v2")).toBe(true);
    expect(Value.Check(model, "gemini-3.8-flash-low")).toBe(false);
  });

  it("discovers an immutable Antigravity catalogue", async () => {
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
});

describe("consulting_run input contract", () => {
  it("requires one new or continue branch and all new-selection fields", () => {
    const catalogue = ["agent-native-model"] as const;
    const selected = {
      prompt: "x",
      new: { agent: "antigravity", model: catalogue[0], workspace: false },
    };
    expect(parseConsultingRunInput(selected, "antigravity", catalogue)).toEqual(selected);
    expect(() => parseConsultingRunInput({ prompt: "x" }, "antigravity", catalogue)).toThrow(
      /exactly one/,
    );
    expect(() =>
      parseConsultingRunInput(
        { prompt: "x", new: { model: catalogue[0], workspace: false } },
        "antigravity",
        catalogue,
      ),
    ).toThrow();
    expect(() =>
      parseConsultingRunInput(
        { prompt: "x", new: { agent: "unknown", model: catalogue[0], workspace: false } },
        "antigravity",
        catalogue,
      ),
    ).toThrow();
    expect(() =>
      parseConsultingRunInput(
        { prompt: "x", new: { agent: "antigravity", model: catalogue[0] } },
        "antigravity",
        catalogue,
      ),
    ).toThrow();
    expect(() =>
      parseConsultingRunInput(
        {
          prompt: "x",
          new: { agent: "antigravity", model: catalogue[0], workspace: false },
          continue: { handle: "consult_saved" },
        },
        "antigravity",
        catalogue,
      ),
    ).toThrow();

    const schema = buildConsultingRunSchema("antigravity", catalogue);
    expect(schema).toMatchObject({ type: "object", minProperties: 2, maxProperties: 2 });
    expect(
      Value.Check(schema, {
        prompt: "x",
        new: { agent: "antigravity", model: catalogue[0], workspace: false },
      }),
    ).toBe(true);
    expect(
      Value.Check(schema, { prompt: "x", new: { model: catalogue[0], workspace: false } }),
    ).toBe(false);
    expect(
      Value.Check(schema, {
        prompt: "x",
        new: { agent: "antigravity", model: catalogue[0], workspace: false },
        continue: { handle: "consult_saved" },
      }),
    ).toBe(false);
    expect(
      Value.Check(schema, {
        prompt: "x",
        continue: { handle: "consult_saved", model: catalogue[0] },
      }),
    ).toBe(false);
  });
});
