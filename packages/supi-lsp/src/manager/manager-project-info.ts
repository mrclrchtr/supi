import type { LspClient } from "../client/client.ts";
import { getSupportedLspServerActions } from "../config/server-actions.ts";
import type { ProjectServerInfo, ProjectServerStatusReason } from "../config/server-config.ts";
import { displayRelativeFilePath } from "../summary.ts";

interface ProjectServerInfoInput {
  serverName: string;
  root: string;
  fileTypes: string[];
  client: LspClient | undefined;
  unavailableReason?: "missing-command" | "start-failed" | "runtime-error";
  statusReason?: ProjectServerStatusReason;
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
    supportedActions: getSupportedLspServerActions(input.client?.serverCapabilities),
    openFiles: input.client?.openFiles.map((file) => displayRelativeFilePath(file, cwd)) ?? [],
    ready: input.client?.ready ?? false,
  };
}
