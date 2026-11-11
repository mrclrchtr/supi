import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Resolve `~` and relative paths against the home and current directories. */
export function localPath(path) {
  return resolve(
    path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path,
  );
}

export async function canonicalPath(path) {
  const absolute = localPath(path);
  try {
    return await realpath(absolute);
  } catch (error) {
    if (error.code === "ENOENT") return absolute;
    throw error;
  }
}

async function settings(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error(`Cannot read settings: ${path}`, { cause: error });
  }
}

export function agentDirectory() {
  return localPath(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi/agent"));
}

/** Flag, PI_CODING_AGENT_SESSION_DIR, project/global sessionDir, then `<agentDir>/sessions`. */
export async function sessionDirectory(explicit) {
  if (explicit) return localPath(explicit);
  if (process.env.PI_CODING_AGENT_SESSION_DIR)
    return localPath(process.env.PI_CODING_AGENT_SESSION_DIR);
  const agentDir = agentDirectory();
  const project = await settings(join(process.cwd(), ".pi/settings.json"));
  if (typeof project.sessionDir === "string") return localPath(project.sessionDir);
  const global = await settings(join(agentDir, "settings.json"));
  return typeof global.sessionDir === "string"
    ? localPath(global.sessionDir)
    : join(agentDir, "sessions");
}
