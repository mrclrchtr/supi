import type { LspClient } from "../client/client.ts";
import type { ProjectServerInfo, ProjectServerStatusReason } from "../config/server-config.ts";
import { displayRelativeFilePath } from "../summary.ts";

interface ProjectServerInfoInput {
  serverName: string;
  root: string;
  fileTypes: string[];
  client: LspClient | undefined;
  unavailableReason?: "missing-command" | "start-failed" | "runtime-error";
  statusReason?: ProjectServerStatusReason;
  /** Filter files from ambient project status without changing explicit routing. */
  includeOpenFile?: (file: string) => boolean;
}

export function buildProjectServerInfo(
  input: ProjectServerInfoInput,
  cwd: string,
): ProjectServerInfo {
  const status = input.statusReason
    ? "error"
    : input.client?.status === "running"
      ? "running"
      : input.client?.status === "error" || input.unavailableReason === "start-failed"
        ? "error"
        : input.unavailableReason === "runtime-error"
          ? "error"
          : "unavailable";

  return {
    name: input.serverName,
    root: input.root,
    fileTypes: input.fileTypes,
    status,
    ...(input.statusReason ? { statusReason: input.statusReason } : {}),
    openFiles:
      input.client?.openFiles
        .filter((file) => input.includeOpenFile?.(file) ?? true)
        .map((file) => displayRelativeFilePath(file, cwd)) ?? [],
    ready: input.client?.ready ?? false,
  };
}
