import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiMock, getHandlerOrThrow, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findRetiredPackageDeclarations,
  npmPackageName,
  type RetiredPackage,
  warnRetiredPackages,
} from "../../src/retired-packages.ts";

const WARNED_KEY = Symbol.for("@mrclrchtr/supi-core/retired-packages-warned");
const CACHE: RetiredPackage = {
  name: "@mrclrchtr/supi-cache",
  replacement: "@mrclrchtr/supi-debug",
};

describe("npmPackageName", () => {
  it("ignores version pins and object form, and rejects non-npm sources", () => {
    expect(npmPackageName("npm:@mrclrchtr/supi-cache@12.0.0")).toBe("@mrclrchtr/supi-cache");
    expect(npmPackageName({ source: "npm:@mrclrchtr/supi-cache" })).toBe("@mrclrchtr/supi-cache");
    expect(npmPackageName("npm:@mrclrchtr/supi-cache-extra")).toBe("@mrclrchtr/supi-cache-extra");
    expect(npmPackageName("git:github.com/mrclrchtr/supi-cache")).toBeUndefined();
    expect(npmPackageName("./packages/supi-cache")).toBeUndefined();
  });
});

describe("findRetiredPackageDeclarations", () => {
  it("returns one remove command per declaring scope, adding --local for project scope", () => {
    const found = findRetiredPackageDeclarations(
      {
        user: ["npm:@mrclrchtr/supi-cache@12.0.0"],
        project: [{ source: "npm:@mrclrchtr/supi-cache" }],
      },
      [CACHE],
    );

    expect(found.map((declaration) => declaration.removeCommand)).toEqual([
      "pi remove npm:@mrclrchtr/supi-cache --local",
      "pi remove npm:@mrclrchtr/supi-cache",
    ]);
  });
});

describe("warnRetiredPackages", () => {
  let root: string;
  let agentDir: string;
  let cwd: string;

  function writeSettings(dir: string, packages: unknown[]): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ packages }));
  }

  async function startSession(ctxOverrides: Record<string, unknown> = {}) {
    const pi = createPiMock();
    warnRetiredPackages(pi as never, [CACHE], { source: "supi-test", agentDir });
    const ctx = makeCtx({ cwd, hasUI: true, ...ctxOverrides });
    await getHandlerOrThrow(pi, "session_start")({ reason: "startup" }, ctx);
    return ctx;
  }

  beforeEach(() => {
    delete (globalThis as Record<symbol, unknown>)[WARNED_KEY];
    root = mkdtempSync(join(tmpdir(), "supi-retired-"));
    agentDir = join(root, "agent");
    cwd = join(root, "project");
    mkdirSync(cwd, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    delete (globalThis as Record<symbol, unknown>)[WARNED_KEY];
  });

  it("warns once per process with the exact remove command", async () => {
    writeSettings(agentDir, ["npm:@mrclrchtr/supi-cache@12.0.0"]);

    const first = await startSession();
    const second = await startSession();

    expect(first.ui.notify).toHaveBeenCalledOnce();
    expect(first.ui.notify).toHaveBeenCalledWith(
      expect.stringMatching(/ {2}pi remove npm:@mrclrchtr\/supi-cache$/),
      "warning",
    );
    expect(second.ui.notify).not.toHaveBeenCalled();
  });

  it("ignores project declarations when the project is untrusted", async () => {
    writeSettings(join(cwd, ".pi"), ["npm:@mrclrchtr/supi-cache"]);

    const ctx = await startSession({ isProjectTrusted: vi.fn(() => false) });

    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("writes to stderr without UI", async () => {
    writeSettings(join(cwd, ".pi"), ["npm:@mrclrchtr/supi-cache"]);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const ctx = await startSession({ hasUI: false });

      expect(ctx.ui.notify).not.toHaveBeenCalled();
      expect(stderr).toHaveBeenCalledWith(
        expect.stringContaining("pi remove npm:@mrclrchtr/supi-cache --local"),
      );
    } finally {
      stderr.mockRestore();
    }
  });

  it("does not throw on unreadable settings", async () => {
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "settings.json"), "{ not json");

    const ctx = await startSession();

    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });
});
