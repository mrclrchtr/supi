import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatAntigravityLoginCommand,
  getIsolatedAntigravityPaths,
  INSPECTION_PERMISSION_SET,
  initializeConsultationWorkspace,
  mergeInspectionSettings,
  prepareIsolatedAntigravityHome,
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

  it("creates a private macOS keychain for the isolated home", async () => {
    const root = await temporaryDirectory("supi-antigravity-keychain-");
    const paths = getIsolatedAntigravityPaths(root);
    const calls: string[][] = [];
    const privateKeychainPath = join(
      root,
      "supi",
      "antigravity",
      "home",
      "Library",
      "Keychains",
      "antigravity.keychain-db",
    );
    const runSecurityCommand = async (args: readonly string[]): Promise<void> => {
      calls.push([...args]);
      if (args[0] === "create-keychain") {
        const keychainPath = args.at(-1);
        if (!keychainPath) throw new Error("The test keychain path is missing.");
        await writeFile(keychainPath, "");
      }
    };

    await prepareIsolatedAntigravityHome(paths, {
      platform: "darwin",
      runSecurityCommand,
    });

    expect(calls).toEqual([
      ["create-keychain", "-p", "", privateKeychainPath],
      ["unlock-keychain", "-p", "", privateKeychainPath],
    ]);
    expect(paths.keychainPath).toMatch(/Library\/Keychains\/login\.keychain-db$/);
    expect((await lstat(paths.keychainPath)).isSymbolicLink()).toBe(true);
    expect(await readlink(paths.keychainPath)).toBe("antigravity.keychain-db");
    expect((await stat(privateKeychainPath)).mode & 0o777).toBe(0o600);

    await prepareIsolatedAntigravityHome(paths, {
      platform: "darwin",
      runSecurityCommand,
    });
    expect(calls).toEqual([
      ["create-keychain", "-p", "", privateKeychainPath],
      ["unlock-keychain", "-p", "", privateKeychainPath],
      ["unlock-keychain", "-p", "", privateKeychainPath],
    ]);
  });

  it("replaces a legacy real login keychain without using its password", async () => {
    const root = await temporaryDirectory("supi-antigravity-keychain-migration-");
    const paths = getIsolatedAntigravityPaths(root);
    const privateKeychainPath = join(dirname(paths.keychainPath), "antigravity.keychain-db");
    await mkdir(dirname(paths.keychainPath), { recursive: true });
    await writeFile(paths.keychainPath, "legacy keychain");
    const calls: string[][] = [];
    const runSecurityCommand = async (args: readonly string[]): Promise<void> => {
      calls.push([...args]);
      if (args[0] === "create-keychain") {
        const keychainPath = args.at(-1);
        if (!keychainPath) throw new Error("The test keychain path is missing.");
        await writeFile(keychainPath, "");
      }
    };

    await prepareIsolatedAntigravityHome(paths, {
      platform: "darwin",
      runSecurityCommand,
    });

    expect((await lstat(paths.keychainPath)).isSymbolicLink()).toBe(true);
    expect(calls).toEqual([
      ["create-keychain", "-p", "", privateKeychainPath],
      ["unlock-keychain", "-p", "", privateKeychainPath],
    ]);
  });

  it("does not create a keychain on Linux", async () => {
    const root = await temporaryDirectory("supi-antigravity-linux-");
    const paths = getIsolatedAntigravityPaths(root);
    const runSecurityCommand = async (): Promise<void> => {
      throw new Error("Security commands are not supported on Linux.");
    };

    await prepareIsolatedAntigravityHome(paths, {
      platform: "linux",
      runSecurityCommand,
    });

    await expect(stat(paths.keychainPath)).rejects.toThrow();
  });

  it("prints the resolved isolated sign-in command", async () => {
    const root = await temporaryDirectory("supi-antigravity-login-");
    const paths = getIsolatedAntigravityPaths(root);
    const command = formatAntigravityLoginCommand(paths);
    expect(command).toContain(`cd "${paths.consultationWorkspace}" &&`);
    expect(command).toContain(`HOME="${paths.homeDir}" AGY_CLI_DISABLE_AUTO_UPDATE=true agy`);
  });
});
