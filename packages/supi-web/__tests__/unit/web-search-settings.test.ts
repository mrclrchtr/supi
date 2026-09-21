import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SettingsModule, SUPI_SETTINGS_COLLECT_EVENT } from "@mrclrchtr/supi-core/settings";
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { registerWebSettings } from "../../src/settings-registration.ts";

type SettingsCollector = { add: (module: SettingsModule) => void };

function collectSettings(pi: ReturnType<typeof createPiMock>): SettingsModule {
  let module: SettingsModule | undefined;
  const collector: SettingsCollector = {
    add: (candidate) => {
      module = candidate;
    },
  };
  pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, collector);
  if (!module) throw new Error("Web settings were not registered");
  return module;
}

describe("Web Search settings", () => {
  const originalPath = process.env.PATH;
  const tempDirectories: string[] = [];

  afterEach(() => {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    for (const directory of tempDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses enabled defaults and keeps global and project values separate", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "supi-web-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "supi-web-project-"));
    tempDirectories.push(homeDir, cwd);
    const pi = createPiMock();
    registerWebSettings(pi as never, homeDir);
    const module = collectSettings(pi);

    const initial = await module.read({ scope: "project", cwd });
    expect(initial.rows[0]).toMatchObject({ editValue: "on", source: "default" });

    const globalNotice = await module.apply({
      scope: "global",
      cwd,
      fieldKey: "webSearchEnabled",
      action: { kind: "set", value: "off" },
    });
    expect(globalNotice.notice?.message).toContain("/reload");
    expect(globalNotice.notice?.level).toBe("info");

    const inherited = await module.read({ scope: "project", cwd });
    expect(inherited.rows[0]).toMatchObject({ editValue: "off", source: "global" });

    await module.apply({
      scope: "project",
      cwd,
      fieldKey: "webSearchEnabled",
      action: { kind: "set", value: "on" },
    });
    const overridden = await module.read({ scope: "project", cwd });
    expect(overridden.rows[0]).toMatchObject({ editValue: "on", source: "project" });

    const resetNotice = await module.apply({
      scope: "project",
      cwd,
      fieldKey: "webSearchEnabled",
      action: { kind: "unset" },
    });
    expect(resetNotice.notice?.message).toContain("/reload");
    expect((await module.read({ scope: "project", cwd })).rows[0]).toMatchObject({
      editValue: "off",
      source: "global",
    });
    expect(pi.setActiveTools).not.toHaveBeenCalled();
  });

  it("warns when enabling without bx and keeps the preference enabled", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "supi-web-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "supi-web-project-"));
    const emptyPath = mkdtempSync(join(tmpdir(), "supi-web-empty-path-"));
    tempDirectories.push(homeDir, cwd, emptyPath);
    process.env.PATH = emptyPath;

    const pi = createPiMock();
    registerWebSettings(pi as never, homeDir);
    const module = collectSettings(pi);
    const result = await module.apply({
      scope: "project",
      cwd,
      fieldKey: "webSearchEnabled",
      action: { kind: "set", value: "on" },
    });

    expect(result.notice?.level).toBe("warning");
    expect(result.notice?.message).toContain("bx");
    expect(result.notice?.message).toContain("/reload");
    expect((await module.read({ scope: "project", cwd })).rows[0]).toMatchObject({
      editValue: "on",
      source: "project",
    });
    expect(pi.setActiveTools).not.toHaveBeenCalled();
  });
});
