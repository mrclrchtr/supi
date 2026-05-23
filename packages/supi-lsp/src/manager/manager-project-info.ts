import type { LspClient } from "../client/client.ts";
import type { ProjectServerInfo } from "../config/server-config.ts";
import { displayRelativeFilePath } from "../summary.ts";
import { getSupportedLspServerActions } from "../tool/tool-specs.ts";

interface ProjectServerInfoInput {
  serverName: string;
  root: string;
  fileTypes: string[];
  client: LspClient | undefined;
  unavailableReason?: "missing-command" | "start-failed" | "runtime-error";
}

export function buildProjectServerInfo(
  input: ProjectServerInfoInput,
  cwd: string,
): ProjectServerInfo {
  const status =
    input.client?.status === "running"
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
    supportedActions: getSupportedLspServerActions(input.client?.serverCapabilities),
    openFiles: input.client?.openFiles.map((file) => displayRelativeFilePath(file, cwd)) ?? [],
  };
}
