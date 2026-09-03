import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);
const ANTIGRAVITY_BASE_DIR = join("supi", "antigravity");
const SETTINGS_RELATIVE_PATH = join(".gemini", "antigravity-cli", "settings.json");
const EMPTY_TEMPLATE_NAME = "empty-git-template";

/** The package-owned paths used by Antigravity. */
export interface IsolatedAntigravityPaths {
  agentDir: string;
  baseDir: string;
  homeDir: string;
  consultationWorkspace: string;
  settingsPath: string;
  gitTemplateDir: string;
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
): Promise<IsolatedAntigravityPaths> {
  await mkdir(paths.homeDir, { recursive: true, mode: 0o700 });
  await mkdir(dirname(paths.settingsPath), { recursive: true, mode: 0o700 });
  await chmod(paths.homeDir, 0o700);
  await chmod(dirname(paths.settingsPath), 0o700);
  await Promise.all([
    initializeConsultationWorkspace(paths),
    mergeInspectionSettings(paths.settingsPath),
  ]);
  return paths;
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
