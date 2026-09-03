import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatAntigravityLoginCommand,
  getIsolatedAntigravityPaths,
  INSPECTION_PERMISSION_SET,
  initializeConsultationWorkspace,
  mergeInspectionSettings,
} from "../../src/isolated-home.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

describe("Isolated Antigravity Home", () => {
  it("merges settings, preserves unknown values, and writes the enforced policy", async () => {
    const root = await temporaryDirectory("supi-antigravity-settings-");
    const paths = getIsolatedAntigravityPaths(root);
    await mkdir(join(root, "supi", "antigravity", "home", ".gemini", "antigravity-cli"), {
      recursive: true,
    });
    await writeFile(
      paths.settingsPath,
      JSON.stringify({
        customSetting: "keep",
        permissions: { customPermission: true, allow: ["bad"] },
      }),
    );

    await mergeInspectionSettings(paths.settingsPath);
    const settings = JSON.parse(await readFile(paths.settingsPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(settings.customSetting).toBe("keep");
    expect(settings.allowNonWorkspaceAccess).toBe(false);
    expect(settings.permissions).toEqual({
      customPermission: true,
      allow: [...INSPECTION_PERMISSION_SET.permissions.allow],
      deny: [...INSPECTION_PERMISSION_SET.permissions.deny],
    });
    expect((await stat(paths.settingsPath)).mode & 0o777).toBe(0o600);
  });

  it("initializes an empty Git consultation workspace without user template hooks", async () => {
    const root = await temporaryDirectory("supi-antigravity-git-");
    const template = join(root, "user-template");
    await mkdir(join(template, "hooks"), { recursive: true });
    const hook = join(template, "hooks", "pre-commit");
    await writeFile(hook, "#!/bin/sh\necho user hook\n");
    await chmod(hook, 0o755);
    const paths = getIsolatedAntigravityPaths(join(root, "agent"));
    const previous = process.env.GIT_TEMPLATE_DIR;
    process.env.GIT_TEMPLATE_DIR = template;
    try {
      await initializeConsultationWorkspace(paths);
    } finally {
      if (previous === undefined) delete process.env.GIT_TEMPLATE_DIR;
      else process.env.GIT_TEMPLATE_DIR = previous;
    }

    expect(await stat(join(paths.consultationWorkspace, ".git"))).toBeTruthy();
    await expect(
      stat(join(paths.consultationWorkspace, ".git", "hooks", "pre-commit")),
    ).rejects.toThrow();
  });

  it("prints the resolved isolated sign-in command", async () => {
    const root = await temporaryDirectory("supi-antigravity-login-");
    const paths = getIsolatedAntigravityPaths(root);
    const command = formatAntigravityLoginCommand(paths);
    expect(command).toContain(`cd "${paths.consultationWorkspace}" &&`);
    expect(command).toContain(`HOME="${paths.homeDir}" AGY_CLI_DISABLE_AUTO_UPDATE=true agy`);
  });
});
