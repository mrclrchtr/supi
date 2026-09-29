import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getExplicitlyDisabledLanguages, loadConfig } from "../../src/config/config.ts";

let cwd: string;
let homeDir: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "supi-disabled-workspace-"));
  homeDir = mkdtempSync(join(tmpdir(), "supi-disabled-home-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(homeDir, { recursive: true, force: true });
});

function writeServers(scope: "global" | "project", servers: Record<string, unknown>): void {
  const directory = scope === "global" ? join(homeDir, ".pi/agent/supi") : join(cwd, ".pi/supi");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "config.json"), JSON.stringify({ lsp: { servers } }));
}

function expectDisabled(disabled: boolean, projectTrusted = true): void {
  const options = { homeDir, projectTrusted };
  expect(getExplicitlyDisabledLanguages(cwd, options)).toEqual(disabled ? ["c"] : []);
  expect(Boolean(loadConfig(cwd, options).servers.c)).toBe(!disabled);
}

describe("disabled-language alias precedence", () => {
  it.each(["global", "project"] as const)(
    "uses alias fields in either property order in %s config",
    (scope) => {
      for (const servers of [
        { cpp: { enabled: false }, c: { enabled: true } },
        { c: { enabled: true }, cpp: { enabled: false } },
      ]) {
        writeServers(scope, servers);
        expectDisabled(true);
      }
    },
  );

  it("lets the alias explicitly enable a disabled canonical key", () => {
    for (const servers of [
      { cpp: { enabled: true }, c: { enabled: false } },
      { c: { enabled: false }, cpp: { enabled: true } },
    ]) {
      writeServers("global", servers);
      expectDisabled(false);
    }
  });

  it("retains canonical enablement when the alias changes another field", () => {
    writeServers("project", { cpp: { command: "custom-clangd" }, c: { enabled: false } });
    expectDisabled(true);
  });

  it("lets project enablement override a global alias disablement", () => {
    writeServers("global", { cpp: { enabled: false }, c: { enabled: true } });
    writeServers("project", { c: { enabled: true } });
    expectDisabled(false);
    expectDisabled(true, false);
  });

  it("lets project alias disablement override global enablement", () => {
    writeServers("global", { c: { enabled: true } });
    writeServers("project", { cpp: { enabled: false }, c: { enabled: true } });
    expectDisabled(true);
    expectDisabled(false, false);
  });
});
