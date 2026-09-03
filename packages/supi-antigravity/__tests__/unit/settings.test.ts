import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsContributionCollector } from "@mrclrchtr/supi-core/settings";
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANTIGRAVITY_CONFIG_SECTION,
  ANTIGRAVITY_DEFAULTS,
  loadAntigravityConfig,
} from "../../src/config.ts";
import { registerAntigravitySettings } from "../../src/settings.ts";

const roots: string[] = [];

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "supi-antigravity-settings-test-"));
  roots.push(root);
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Antigravity settings", () => {
  it("defaults the Agent tool to enabled", () => {
    expect(loadAntigravityConfig("/missing", roots[0])).toEqual(ANTIGRAVITY_DEFAULTS);
  });

  it("wraps fixed settings apply and awaits the refresh", async () => {
    const pi = createPiMock();
    let completed = false;
    const runtime = {
      refresh: vi.fn(async () => {
        completed = true;
      }),
    };
    registerAntigravitySettings(pi as never, runtime as never, roots[0]);
    const collector = createSettingsContributionCollector();
    pi.events.emit("supi:settings:collect", collector);
    const module = collector
      .result()
      .modules.find((item) => item.id === ANTIGRAVITY_CONFIG_SECTION);
    if (!module) throw new Error("Antigravity settings were not registered");
    const cwd = join(roots[0], "repo");
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
