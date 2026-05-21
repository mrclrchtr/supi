// Prompt guidance and tool descriptions for the expert LSP toolset.

import * as path from "node:path";
import type { ProjectServerInfo } from "../config/types.ts";
import { LSP_LOOKUP_TOOL, type LspToolName } from "./names.ts";
import { LSP_TOOL_DEFINITION_SPECS } from "./tool-specs.ts";

export interface LspToolPromptSurface {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

export type LspToolPromptSurfaceMap = Record<LspToolName, LspToolPromptSurface>;

export const defaultLspToolPromptSurfaces = buildLspToolPromptSurfaces([], ".");

export function buildLspToolPromptSurfaces(
  servers: ProjectServerInfo[],
  cwd: string,
): LspToolPromptSurfaceMap {
  const coverageGuidelines = buildCoverageGuidelines(servers, cwd);

  return Object.fromEntries(
    LSP_TOOL_DEFINITION_SPECS.map((spec) => [
      spec.name,
      {
        description: spec.description,
        promptSnippet: spec.promptSnippet,
        promptGuidelines:
          "includeCoverageGuidelines" in spec && spec.includeCoverageGuidelines
            ? [...spec.basePromptGuidelines, ...coverageGuidelines]
            : [...spec.basePromptGuidelines],
      } satisfies LspToolPromptSurface,
    ]),
  ) as LspToolPromptSurfaceMap;
}

function buildCoverageGuidelines(servers: ProjectServerInfo[], cwd: string): string[] {
  const active = servers
    .filter((server) => server.status === "running")
    .map((server) => {
      const root = displayRoot(server.root, cwd);
      const fileTypes = server.fileTypes.map((entry) => `.${entry}`).join(",");
      const actions = server.supportedActions.join(",");
      const actionText = actions.length > 0 ? ` | actions: ${actions}` : "";
      return `lsp server coverage: ${server.name} | root: ${root} | files: ${fileTypes}${actionText}`;
    });

  const unavailable = servers
    .filter((server) => server.status !== "running")
    .map((server) => server.name);

  const dynamic = [...active];
  if (unavailable.length > 0) {
    dynamic.push(
      `lsp server unavailable: ${unavailable.join(",")} — install or enable to extend semantic coverage`,
    );
  }

  return dynamic;
}

function displayRoot(root: string, cwd: string): string {
  const relative = path.relative(cwd, root);
  if (relative === "") return ".";
  if (relative.startsWith(`..${path.sep}`) || relative === "..") return root;
  return relative.replaceAll(path.sep, "/");
}

// Compatibility exports for older internal tests and helper imports.
export const toolDescription = defaultLspToolPromptSurfaces[LSP_LOOKUP_TOOL].description;
export const promptSnippet = defaultLspToolPromptSurfaces[LSP_LOOKUP_TOOL].promptSnippet;
export const promptGuidelines = defaultLspToolPromptSurfaces[LSP_LOOKUP_TOOL].promptGuidelines;

export function buildProjectGuidelines(servers: ProjectServerInfo[], cwd: string): string[] {
  return buildLspToolPromptSurfaces(servers, cwd)[LSP_LOOKUP_TOOL].promptGuidelines;
}
