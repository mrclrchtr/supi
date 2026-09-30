import { mkdtemp, rm } from "node:fs/promises";
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
    expect(loadConsultingConfig("/missing", roots[0])).toEqual({ agentToolEnabled: true });
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
