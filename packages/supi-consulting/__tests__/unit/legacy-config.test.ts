import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSupiConfig } from "@mrclrchtr/supi-core/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConsultingConfig } from "../../src/config.ts";
import { checkLegacyAntigravityConfig } from "../../src/legacy-config.ts";

let home: string;
let cwd: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "supi-consulting-legacy-test-"));
  cwd = join(home, "repo");
  await mkdir(cwd, { recursive: true });
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function save(section: string, scope: "global" | "project", value: Record<string, unknown>) {
  writeSupiConfig({ section, scope, cwd }, value, { homeDir: home });
}

function check(projectTrusted = true): string | undefined {
  return checkLegacyAntigravityConfig({ cwd, homeDir: home, projectTrusted });
}

describe("legacy antigravity configuration", () => {
  it("stays quiet without a legacy section", () => {
    save("consulting", "global", { agentToolEnabled: false });
    expect(check()).toBeUndefined();
  });

  it("asks only for removal when an old true matches the default", () => {
    save("antigravity", "global", { agentToolEnabled: true });
    const warning = check();
    expect(warning).toContain("global ~/.pi/agent/supi/config.json, agentToolEnabled: true");
    expect(warning).toContain("consulting.agentToolEnabled applies: it is true (default)");
    expect(warning).toContain("consulting_run is enabled");
    expect(warning).toContain("no setting change is needed");
    expect(warning).not.toContain(home);
  });

  it("explains how to keep an old disable without changing the configuration", () => {
    save("antigravity", "global", { agentToolEnabled: false });
    const warning = check();
    expect(warning).toContain("it is true (default), so consulting_run is enabled");
    expect(warning).toContain("set consulting.agentToolEnabled to false");
    expect(loadConsultingConfig(cwd, home).agentToolEnabled).toBe(true);
  });

  it("reports the new section as effective when both sections exist", () => {
    save("antigravity", "global", { agentToolEnabled: false });
    save("consulting", "project", { agentToolEnabled: false });
    const warning = check();
    expect(warning).toContain("it is false (project consulting.agentToolEnabled)");
    expect(warning).toContain("consulting_run is disabled");
    expect(warning).toContain("no setting change is needed");
  });

  it("warns about an untrusted project section and explains that it does not apply", () => {
    save("antigravity", "project", { agentToolEnabled: false });
    save("consulting", "project", { agentToolEnabled: false });
    const warning = check(false);
    expect(warning).toContain("project ~/repo/.pi/supi/config.json, agentToolEnabled: false");
    expect(warning).toContain("it is true (default)");
    expect(warning).toContain("project is not trusted");
    expect(warning).toContain("set consulting.agentToolEnabled to false");
  });
});
