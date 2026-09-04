import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);
const ANTIGRAVITY_BASE_DIR = join("supi", "antigravity");
const SETTINGS_RELATIVE_PATH = join(".gemini", "antigravity-cli", "settings.json");
// macOS uses this conventional filename as the default keychain for an alternate HOME.
const KEYCHAIN_RELATIVE_PATH = join("Library", "Keychains", "login.keychain-db");
// A keychain with the special login name gets a user-password-managed password. Use a
// package-owned keychain with an empty password, then expose it through the conventional name.
const PRIVATE_KEYCHAIN_FILE_NAME = "antigravity.keychain-db";
const EMPTY_TEMPLATE_NAME = "empty-git-template";
const SECURITY_COMMAND = "/usr/bin/security";

/** The package-owned paths used by Antigravity. */
export interface IsolatedAntigravityPaths {
  agentDir: string;
  baseDir: string;
  homeDir: string;
  consultationWorkspace: string;
  settingsPath: string;
  gitTemplateDir: string;
  /** The conventional macOS keychain path backed by the private isolated keychain. */
  keychainPath: string;
}

/** Return package-owned Antigravity paths for one Pi agent directory. */
export function getIsolatedAntigravityPaths(
  agentDir = resolveAgentDirectory(),
): IsolatedAntigravityPaths {
  const baseDir = join(agentDir, ANTIGRAVITY_BASE_DIR);
  const homeDir = join(baseDir, "home");
  const consultationWorkspace = join(baseDir, "consultation-workspace");
  return {
    agentDir,
    baseDir,
    homeDir,
    consultationWorkspace,
    settingsPath: join(homeDir, SETTINGS_RELATIVE_PATH),
    gitTemplateDir: join(baseDir, EMPTY_TEMPLATE_NAME),
    keychainPath: join(homeDir, KEYCHAIN_RELATIVE_PATH),
  };
}

/** Return the agent state directory used by the current Pi installation. */
export function resolveAgentDirectory(): string {
  return process.env.PI_CODING_AGENT_DIR || getAgentDir();
}

/** The exact Inspection Permission Set enforced in the Isolated Antigravity Home. */
export const INSPECTION_PERMISSION_SET = Object.freeze({
  allowNonWorkspaceAccess: false,
  permissions: Object.freeze({
    allow: Object.freeze(["read_url(*)"]),
    deny: Object.freeze([
      "write_file(*)",
      "command(*)",
      "unsandboxed(*)",
      "mcp(*)",
      "execute_url(*)",
    ]),
  }),
});

const consultationInitializations = new Map<string, Promise<void>>();
const keychainInitializations = new Map<string, Promise<void>>();

/** Options for preparing an isolated profile. */
export interface IsolatedAntigravityPreparationOptions {
  /** Override the host platform for tests. */
  platform?: NodeJS.Platform;
  /** Run one macOS Security command. */
  runSecurityCommand?: (args: readonly string[], homeDir: string) => Promise<void>;
}

/** Create the stable empty Consultation Workspace without user Git templates. */
export async function initializeConsultationWorkspace(
  paths: IsolatedAntigravityPaths,
): Promise<void> {
  const existing = consultationInitializations.get(paths.consultationWorkspace);
  if (existing) {
    await existing;
    return;
  }
  const initialization = initializeConsultationWorkspaceOnce(paths).finally(() => {
    consultationInitializations.delete(paths.consultationWorkspace);
  });
  consultationInitializations.set(paths.consultationWorkspace, initialization);
  await initialization;
}

async function initializeConsultationWorkspaceOnce(paths: IsolatedAntigravityPaths): Promise<void> {
  await mkdir(paths.baseDir, { recursive: true, mode: 0o700 });
  await mkdir(paths.gitTemplateDir, { recursive: true, mode: 0o700 });
  await mkdir(paths.consultationWorkspace, { recursive: true, mode: 0o700 });
  await chmod(paths.baseDir, 0o700);
  await chmod(paths.gitTemplateDir, 0o700);
  await chmod(paths.consultationWorkspace, 0o700);

  if (await isGitRepository(paths.consultationWorkspace)) return;

  try {
    await execFileAsync(
      "git",
      ["init", "--quiet", `--template=${paths.gitTemplateDir}`, paths.consultationWorkspace],
      {
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: "1",
        },
        maxBuffer: 64 * 1024,
      },
    );
  } catch (error) {
    throw new Error("Could not initialize the Antigravity Consultation Workspace.", {
      cause: error,
    });
  }
}

async function isGitRepository(directory: string): Promise<boolean> {
  try {
    await stat(join(directory, ".git"));
    return true;
  } catch {
    return false;
  }
}

/** Prepare both package-owned directories and atomically enforce permissions. */
export async function prepareIsolatedAntigravityHome(
  paths = getIsolatedAntigravityPaths(),
  options: IsolatedAntigravityPreparationOptions = {},
): Promise<IsolatedAntigravityPaths> {
  const keychainDirectory = dirname(paths.keychainPath);
  const libraryDirectory = dirname(keychainDirectory);
  const isMacOS = (options.platform ?? process.platform) === "darwin";
  await mkdir(paths.homeDir, { recursive: true, mode: 0o700 });
  await mkdir(dirname(paths.settingsPath), { recursive: true, mode: 0o700 });
  if (isMacOS) await mkdir(keychainDirectory, { recursive: true, mode: 0o700 });
  await chmod(paths.homeDir, 0o700);
  await chmod(dirname(paths.settingsPath), 0o700);
  if (isMacOS) {
    await chmod(libraryDirectory, 0o700);
    await chmod(keychainDirectory, 0o700);
  }
  await Promise.all([
    initializeConsultationWorkspace(paths),
    mergeInspectionSettings(paths.settingsPath),
    prepareIsolatedMacOSKeychain(paths, options),
  ]);
  return paths;
}

async function prepareIsolatedMacOSKeychain(
  paths: IsolatedAntigravityPaths,
  options: IsolatedAntigravityPreparationOptions,
): Promise<void> {
  if ((options.platform ?? process.platform) !== "darwin") return;
  const existing = keychainInitializations.get(paths.keychainPath);
  if (existing) {
    await existing;
    return;
  }
  const runSecurityCommand = options.runSecurityCommand ?? runMacOSSecurityCommand;
  const initialization = prepareIsolatedMacOSKeychainOnce(paths, runSecurityCommand).finally(() => {
    keychainInitializations.delete(paths.keychainPath);
  });
  keychainInitializations.set(paths.keychainPath, initialization);
  await initialization;
}

async function prepareIsolatedMacOSKeychainOnce(
  paths: IsolatedAntigravityPaths,
  runSecurityCommand: (args: readonly string[], homeDir: string) => Promise<void>,
): Promise<void> {
  const keychainDirectory = dirname(paths.keychainPath);
  const privateKeychainPath = join(keychainDirectory, PRIVATE_KEYCHAIN_FILE_NAME);
  await replaceLegacyKeychainEntry(paths.keychainPath, privateKeychainPath);
  if (!(await pathExists(privateKeychainPath))) {
    await runSecurityCommand(["create-keychain", "-p", "", privateKeychainPath], paths.homeDir);
  }
  if (!(await isSymlinkTo(paths.keychainPath, PRIVATE_KEYCHAIN_FILE_NAME))) {
    await rm(paths.keychainPath, { force: true });
    await symlink(PRIVATE_KEYCHAIN_FILE_NAME, paths.keychainPath);
  }
  // The private keychain has an empty password. Unlocking it with that known password is
  // non-interactive and prevents a locked keychain from starting SecurityAgent.
  await runSecurityCommand(["unlock-keychain", "-p", "", privateKeychainPath], paths.homeDir);
  await chmod(privateKeychainPath, 0o600);
}

async function replaceLegacyKeychainEntry(
  keychainPath: string,
  privateKeychainPath: string,
): Promise<void> {
  const entry = await readFileEntry(keychainPath);
  if (!entry) return;
  if (entry.isSymbolicLink()) {
    if (await isSymlinkTo(keychainPath, PRIVATE_KEYCHAIN_FILE_NAME)) return;
    await rm(keychainPath, { force: true });
    return;
  }
  if (keychainPath === privateKeychainPath) return;
  await rm(keychainPath, { force: true });
}

async function isSymlinkTo(filePath: string, target: string): Promise<boolean> {
  const entry = await readFileEntry(filePath);
  if (!entry?.isSymbolicLink()) return false;
  try {
    return (await readlink(filePath)) === target;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

async function readFileEntry(
  filePath: string,
): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

async function runMacOSSecurityCommand(args: readonly string[], homeDir: string): Promise<void> {
  try {
    await execFileAsync(SECURITY_COMMAND, [...args], {
      env: { HOME: homeDir },
      maxBuffer: 64 * 1024,
    });
  } catch (error) {
    throw new Error("Could not prepare the isolated Antigravity macOS keychain.", {
      cause: error,
    });
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

/** Merge and atomically write the Inspection Permission Set. */
export async function mergeInspectionSettings(settingsPath: string): Promise<void> {
  const existing = await readSettingsObject(settingsPath);
  const existingPermissions = isRecord(existing.permissions) ? existing.permissions : {};
  const merged = {
    ...existing,
    allowNonWorkspaceAccess: INSPECTION_PERMISSION_SET.allowNonWorkspaceAccess,
    permissions: {
      ...existingPermissions,
      allow: [...INSPECTION_PERMISSION_SET.permissions.allow],
      deny: [...INSPECTION_PERMISSION_SET.permissions.deny],
    },
  };
  await writeJsonAtomically(settingsPath, merged);
}

async function readSettingsObject(settingsPath: string): Promise<Record<string, unknown>> {
  let content: string;
  try {
    content = await readFile(settingsPath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return {};
    throw new Error("Could not read the isolated Antigravity settings.", { cause: error });
  }

  try {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) throw new Error("settings root is not an object");
    return parsed;
  } catch (error) {
    throw new Error("The isolated Antigravity settings file is not valid JSON.", { cause: error });
  }
}

/** Write JSON by replacing a same-directory temporary file. */
export async function writeJsonAtomically(
  filePath: string,
  value: Record<string, unknown>,
): Promise<void> {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = join(directory, `.${basename(filePath)}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, filePath);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw new Error("Could not atomically write the isolated Antigravity settings.", {
      cause: error,
    });
  }
}

/** Build the resolved command a user can run to authenticate Antigravity. */
export function formatAntigravityLoginCommand(paths: IsolatedAntigravityPaths): string {
  return [
    `cd ${shellQuote(paths.consultationWorkspace)} &&`,
    `HOME=${shellQuote(paths.homeDir)} AGY_CLI_DISABLE_AUTO_UPDATE=true agy`,
  ].join("\n");
}

function shellQuote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("$", "\\$").replaceAll("`", "\\`")}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
