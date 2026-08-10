import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defineConfigSettings } from "../../../src/settings/settings-schema.ts";

const tempDirs: string[] = [];

function tempHome(): string {
  const path = mkdtempSync(join(tmpdir(), "supi-settings-module-"));
  tempDirs.push(path);
  return path;
}

afterEach(() => {
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("fixed config settings module", () => {
  it("maps UI set and unset actions to scoped config persistence", async () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    const module = defineConfigSettings({
      id: "test",
      label: "Test",
      section: "test",
      defaults: { enabled: true },
      fields: [{ kind: "boolean", key: "enabled", label: "Enabled" }],
      homeDir,
    });

    await module.apply({
      scope: "global",
      cwd,
      fieldKey: "enabled",
      action: { kind: "set", value: "off" },
    });
    expect((await module.read({ scope: "global", cwd })).rows[0]).toMatchObject({
      editValue: "off",
      source: "global",
    });

    await module.apply({
      scope: "global",
      cwd,
      fieldKey: "enabled",
      action: { kind: "unset" },
    });
    expect((await module.read({ scope: "global", cwd })).rows[0]).toMatchObject({
      editValue: "on",
      source: "default",
    });
  });

  it("awaits custom persistence before it resolves", async () => {
    let finish: (() => void) | undefined;
    const module = defineConfigSettings({
      id: "custom",
      label: "Custom",
      section: "custom",
      defaults: {},
      fields: [
        {
          kind: "custom",
          key: "selection",
          label: "Selection",
          resolve: () => ({ displayValue: "none", source: "default" }),
          persist: () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
        },
      ],
    });
    let resolved = false;
    const pending = module
      .apply({
        scope: "project",
        cwd: "/repo",
        fieldKey: "selection",
        action: { kind: "set", value: "saved" },
      })
      .then(() => {
        resolved = true;
      });

    await Promise.resolve();
    expect(resolved).toBe(false);
    finish?.();
    await pending;
    expect(resolved).toBe(true);
  });
});
