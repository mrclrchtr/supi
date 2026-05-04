import type { LspClient } from "../client/client.ts";
import { displayRelativeFilePath } from "../summary.ts";
import type { ProjectServerInfo } from "../types.ts";

interface ProjectServerInfoInput {
  serverName: string;
  root: string;
  fileTypes: string[];
  client: LspClient | undefined;
  unavailable: boolean;
}

export function buildProjectServerInfo(
  input: ProjectServerInfoInput,
  cwd: string,
): ProjectServerInfo {
  const status = input.unavailable
    ? "unavailable"
    : input.client?.status === "running"
      ? "running"
      : input.client?.status === "error"
        ? "error"
        : "unavailable";

  return {
    name: input.serverName,
    root: input.root,
    fileTypes: input.fileTypes,
    status,
    supportedActions: getSupportedActions(input.client?.serverCapabilities),
    openFiles: input.client?.openFiles.map((file) => displayRelativeFilePath(file, cwd)) ?? [],
  };
}

function getSupportedActions(capabilities: LspClient["serverCapabilities"] | undefined): string[] {
  if (!capabilities) return [];

  const actions: string[] = ["diagnostics [optional file]"];
  if (capabilities.hoverProvider) actions.push("hover(file,line,char)");
  if (capabilities.definitionProvider) actions.push("definition(file,line,char)");
  if (capabilities.referencesProvider) actions.push("references(file,line,char)");
  if (capabilities.documentSymbolProvider) actions.push("symbols(file)");
  if (capabilities.renameProvider) actions.push("rename(file,line,char,newName)");
  if (capabilities.codeActionProvider) actions.push("code_actions(file,line,char)");
  return actions;
}
