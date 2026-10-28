import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSupiConfig } from "@mrclrchtr/supi-core/config";
import { createSettingsContributionCollector } from "@mrclrchtr/supi-core/settings";
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSULTING_CONFIG_SECTION,
  CONSULTING_DEFAULTS,
  loadConsultingConfig,
  resolveAdditionalReadOnlyDirectories,
} from "../../src/config.ts";
import { registerConsultingSettings } from "../../src/settings.ts";

const roots: string[] = [];

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "supi-consulting-settings-test-"));
  roots.push(root);
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Consulting settings", () => {
  it("defaults the agent tool to enabled", () => {
    expect(loadConsultingConfig("/missing", roots[0])).toEqual(CONSULTING_DEFAULTS);
  });

  it("does not read the old Antigravity configuration section", () => {
    writeSupiConfig(
      { section: "antigravity", scope: "global", cwd: "/missing" },
      { agentToolEnabled: false },
      { homeDir: roots[0] },
    );
    expect(loadConsultingConfig("/missing", roots[0])).toEqual(CONSULTING_DEFAULTS);
  });

  it("resolves directory aliases and rejects missing paths and regular files before execution", async () => {
    const root = roots[0] as string;
    const directory = join(root, "screenshots");
    const alias = join(root, "screenshots-alias");
    await mkdir(directory);
    await symlink(directory, alias);
    const save = (directories: string[]) =>
      writeSupiConfig(
        { section: CONSULTING_CONFIG_SECTION, scope: "global", cwd: root },
        { additionalReadOnlyDirectories: directories },
        { homeDir: root },
      );
    save([directory, alias]);
    expect(await resolveAdditionalReadOnlyDirectories(root, root)).toEqual([
      await realpath(directory),
    ]);
    save([join(root, "missing")]);
    await expect(resolveAdditionalReadOnlyDirectories(root, root)).rejects.toThrow(/directory/i);
    const file = join(root, "image.png");
    await writeFile(file, "image");
    save([file]);
    await expect(resolveAdditionalReadOnlyDirectories(root, root)).rejects.toThrow(/directory/i);
  });

  it.each([
    { additionalReadOnlyDirectories: "/tmp" },
    { additionalReadOnlyDirectories: ["relative/path"] },
    { additionalReadOnlyDirectories: ["/tmp", 7] },
    { additionalReadOnlyDirectories: ["/tmp\0suffix"] },
  ])(
    "rejects malformed additional directory configuration: $additionalReadOnlyDirectories",
    ({ additionalReadOnlyDirectories }) => {
      const root = roots[0] as string;
      writeSupiConfig(
        { section: CONSULTING_CONFIG_SECTION, scope: "global", cwd: root },
        { additionalReadOnlyDirectories },
        { homeDir: root },
      );
      expect(() => loadConsultingConfig(root, root)).toThrow(/additionalReadOnlyDirectories/);
    },
  );

  it("persists directory lists with project replacement, explicit empty, and inheritance", async () => {
    const root = roots[0] as string;
    const cwd = join(root, "repo");
    const pi = createPiMock();
    const runtime = { refresh: vi.fn() };
    registerConsultingSettings(pi as never, runtime as never, root);
    const collector = createSettingsContributionCollector();
    pi.events.emit("supi:settings:collect", collector);
    const module = collector.result().modules.find((item) => item.id === CONSULTING_CONFIG_SECTION);
    if (!module) throw new Error("Consulting settings were not registered");
    const apply = (scope: "project" | "global", value: string) =>
      module.apply({
        scope,
        cwd,
        fieldKey: "additionalReadOnlyDirectories",
        action: { kind: "set", value },
      });
    await apply("global", "/tmp/global-previews");
    expect(loadConsultingConfig(cwd, root).additionalReadOnlyDirectories).toEqual([
      "/tmp/global-previews",
    ]);
    await apply("project", "/tmp/project-previews, /tmp/other-previews");
    expect(loadConsultingConfig(cwd, root).additionalReadOnlyDirectories).toEqual([
      "/tmp/project-previews",
      "/tmp/other-previews",
    ]);
    await expect(apply("project", "relative/path")).rejects.toThrow(/absolute/);
    expect(loadConsultingConfig(cwd, root).additionalReadOnlyDirectories).toHaveLength(2);
    await apply("project", "");
    expect(loadConsultingConfig(cwd, root).additionalReadOnlyDirectories).toEqual([]);
    await module.apply({
      scope: "project",
      cwd,
      fieldKey: "additionalReadOnlyDirectories",
      action: { kind: "unset" },
    });
    expect(loadConsultingConfig(cwd, root).additionalReadOnlyDirectories).toEqual([
      "/tmp/global-previews",
    ]);
    expect(runtime.refresh).not.toHaveBeenCalled();
  });

  it("wraps fixed settings apply and awaits the refresh", async () => {
    const pi = createPiMock();
    let completed = false;
    const runtime = {
      refresh: vi.fn(async () => {
        completed = true;
      }),
    };
    registerConsultingSettings(pi as never, runtime as never, roots[0]);
    const collector = createSettingsContributionCollector();
    pi.events.emit("supi:settings:collect", collector);
    const module = collector.result().modules.find((item) => item.id === CONSULTING_CONFIG_SECTION);
    if (!module) throw new Error("Consulting settings were not registered");
    const cwd = join(roots[0] as string, "repo");
    await module.apply({
      scope: "project",
      cwd,
      fieldKey: "agentToolEnabled",
      action: { kind: "set", value: "on" },
    });
    expect(runtime.refresh).toHaveBeenCalledWith(cwd, undefined);
    expect(completed).toBe(true);
  });
});
