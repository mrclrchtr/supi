import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sanitizedGitEnv } from "../../src/git.ts";

describe("sanitizedGitEnv", () => {
  const saved = new Map<string, string | undefined>();
  const keys = ["GIT_DIR", "GIT_INDEX_FILE", "GIT_CONFIG_COUNT", "SUPI_GIT_ENV_TEST"];

  beforeEach(() => {
    for (const key of keys) saved.set(key, process.env[key]);
    process.env.GIT_DIR = "/elsewhere/.git";
    process.env.GIT_INDEX_FILE = "/elsewhere/index";
    process.env.GIT_CONFIG_COUNT = "1";
    process.env.SUPI_GIT_ENV_TEST = "kept";
  });

  afterEach(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("drops every inherited GIT_* variable and keeps the rest", () => {
    const env = sanitizedGitEnv();

    expect(Object.keys(env).filter((key) => key.startsWith("GIT_"))).toEqual([]);
    expect(env.SUPI_GIT_ENV_TEST).toBe("kept");
  });

  it("applies caller overrides after sanitizing without changing process.env", () => {
    const env = sanitizedGitEnv({ GIT_INDEX_FILE: "/scratch/index", GIT_TERMINAL_PROMPT: "0" });

    expect(env.GIT_INDEX_FILE).toBe("/scratch/index");
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(env.GIT_DIR).toBeUndefined();
    expect(process.env.GIT_DIR).toBe("/elsewhere/.git");
    expect(process.env.GIT_INDEX_FILE).toBe("/elsewhere/index");
  });
});
