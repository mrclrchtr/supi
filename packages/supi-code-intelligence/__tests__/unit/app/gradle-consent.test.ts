import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ExtensionContext, ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import { loadSupiConfigSectionForScope, writeSupiConfig } from "@mrclrchtr/supi-core/config";
import {
  createSettingsContributionCollector,
  SUPI_SETTINGS_COLLECT_EVENT,
} from "@mrclrchtr/supi-core/settings";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { registerGradleObservations } from "../../../src/gradle/consent.ts";

let cwd: string;
let home: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "gradle-consent-"));
  home = mkdtempSync(join(tmpdir(), "gradle-home-"));
  writeFileSync(join(cwd, "settings.gradle"), "rootProject.name = 'example'\n");
});
afterEach(() => {
  for (const dir of [cwd, home]) rmSync(dir, { recursive: true, force: true });
});
function save(value: unknown) {
  writeSupiConfig(
    { cwd, scope: "project", section: "code-intelligence" },
    { gradleObservation: value },
  );
}
function setup(trusted = true, hasUI = true) {
  const pi = createPiMock();
  const base = makeCtx({ cwd, hasUI, isProjectTrusted: () => trusted });
  const ctx = {
    ...base,
    ui: { ...base.ui, select: vi.fn<(...args: unknown[]) => Promise<string | undefined>>() },
  } as unknown as ExtensionContext;
  const services = registerGradleObservations(pi as never, { homeDir: home });
  const start = async () => {
    for (const handler of pi.getHandlers("session_start")) await handler({}, ctx);
  };
  const settings = () => {
    const collector = createSettingsContributionCollector();
    pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, collector);
    const module = collector
      .result()
      .modules.find((entry) => entry.id === "code-intelligence-gradle");
    if (!module) throw new Error("Missing Gradle settings");
    return module;
  };
  return { pi, ctx, start, settings, services };
}
function trust() {
  new ProjectTrustStore(join(home, ".pi/agent")).set(cwd, true);
}

it("does not execute repository-supplied Allow without an actual Pi trust gate", async () => {
  save("allow");
  const { services, ctx } = setup();
  const result = await services.forContext(ctx).observe(cwd);
  expect(result).toMatchObject({ status: "blocked", reason: expect.stringContaining("trust") });
});

it("asks only at eligible interactive startup; cancel is not persisted", async () => {
  trust();
  const { ctx, start } = setup();
  vi.mocked(ctx.ui.select).mockResolvedValue(undefined);
  await start();
  expect(ctx.ui.select).toHaveBeenCalledWith(
    expect.stringMatching(/settings.*plugins.*download.*cache.*outside/i),
    ["Allow", "Deny", "Cancel"],
  );
  expect(loadSupiConfigSectionForScope("code-intelligence", cwd, { scope: "project" })).toBeNull();
});

it.each(["Allow", "Deny"])("persists startup %s in project config only", async (answer) => {
  trust();
  const { ctx, start } = setup();
  vi.mocked(ctx.ui.select).mockResolvedValue(answer);
  await start();
  expect(
    loadSupiConfigSectionForScope("code-intelligence", cwd, { scope: "project" })
      ?.gradleObservation,
  ).toBe(answer.toLowerCase());
});

it("does not ask or execute when noninteractive and unset, or when Pi declines trust", async () => {
  trust();
  const noUI = setup(true, false);
  await noUI.start();
  expect(noUI.ctx.ui.select).not.toHaveBeenCalled();
  expect(await noUI.services.forContext(noUI.ctx).observe(cwd)).toMatchObject({
    status: "blocked",
  });
  save("allow");
  const untrusted = setup(false);
  await untrusted.start();
  expect(await untrusted.services.forContext(untrusted.ctx).observe(cwd)).toMatchObject({
    status: "blocked",
  });
});

it("ignores global Allow, exposes project-only settings, and reset restores asking", async () => {
  trust();
  writeSupiConfig(
    { cwd, scope: "global", section: "code-intelligence" },
    { gradleObservation: "allow" },
    { homeDir: home },
  );
  const { settings, ctx, start } = setup();
  const module = settings();
  expect((await module.read({ cwd, scope: "global", ctx })).rows).toEqual([]);
  expect((await module.read({ cwd, scope: "project", ctx })).rows[0]?.displayValue).toBe("Unset");
  await module.apply({
    cwd,
    scope: "project",
    ctx,
    fieldKey: "gradleObservation",
    action: { kind: "set", value: "deny" },
  });
  await module.apply({
    cwd,
    scope: "project",
    ctx,
    fieldKey: "gradleObservation",
    action: { kind: "unset" },
  });
  vi.mocked(ctx.ui.select).mockResolvedValue("Deny");
  await start();
  expect(ctx.ui.select).toHaveBeenCalledOnce();
});

it("accepts Pi-gated project resources, but never treats unrelated external roots as trusted", async () => {
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  writeFileSync(join(cwd, ".pi/settings.json"), "{}");
  save("deny");
  const { services, ctx, start } = setup();
  await start();
  expect(await services.forContext(ctx).observe(cwd)).toMatchObject({
    status: "blocked",
    reason: expect.stringContaining("denied"),
  });
  save("allow");
  writeFileSync(join(home, "settings.gradle"), "");
  expect(await services.forContext(ctx).observe(home)).toMatchObject({
    status: "blocked",
    reason: expect.stringContaining("trust"),
  });
});
