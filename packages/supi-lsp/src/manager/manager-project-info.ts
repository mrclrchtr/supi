import type { LspClient } from "../client/client.ts";
import { getServerOperationSupport } from "../config/operation-support.ts";
import type {
  ProjectServerInfo,
  ProjectServerStatusReason,
  TypeScriptSelection,
} from "../config/server-config.ts";
import { displayRelativeFilePath } from "../summary.ts";

interface ProjectServerInfoInput {
  serverName: string;
  root: string;
  fileTypes: string[];
  client: LspClient | undefined;
  unavailableReason?: "missing-command" | "start-failed" | "runtime-error";
  statusReason?: ProjectServerStatusReason;
  typescript?: TypeScriptSelection;
  failureMessage?: string;
  /** Filter files from ambient project status without changing explicit routing. */
  includeOpenFile?: (file: string) => boolean;
}

function projectStatus(input: ProjectServerInfoInput): ProjectServerInfo["status"] {
  if (input.statusReason || input.failureMessage) return "error";
  if (input.client?.status === "running") return "running";
  if (
    input.client?.status === "error" ||
    input.unavailableReason === "start-failed" ||
    input.unavailableReason === "runtime-error"
  )
    return "error";
  return "unavailable";
}

export function buildProjectServerInfo(
  input: ProjectServerInfoInput,
  cwd: string,
): ProjectServerInfo {
  const status = projectStatus(input);

  return {
    name: input.serverName,
    root: input.root,
    fileTypes: input.fileTypes,
    status,
    ...(input.typescript ? { typescript: input.typescript } : {}),
    ...(input.failureMessage ? { failureMessage: input.failureMessage } : {}),
    ...(input.statusReason ? { statusReason: input.statusReason } : {}),
    openFiles:
      input.client?.openFiles
        .filter((file) => input.includeOpenFile?.(file) ?? true)
        .map((file) => displayRelativeFilePath(file, cwd)) ?? [],
    ready: input.client?.ready ?? false,
    operationSupport: getServerOperationSupport(input.client?.serverCapabilities ?? null),
  };
}
