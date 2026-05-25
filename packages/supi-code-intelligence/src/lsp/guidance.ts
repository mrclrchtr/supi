import type { ProjectServerInfo } from "@mrclrchtr/supi-lsp/api";
import { LSP_HOVER_TOOL, LSP_TOOL_DEFINITION_SPECS, type LspToolName } from "./tool-specs.ts";

export interface LspToolPromptSurface {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

export type LspToolPromptSurfaceMap = Record<LspToolName, LspToolPromptSurface>;

/** Default prompt surfaces (no server coverage context). */
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
          spec.name === LSP_HOVER_TOOL && coverageGuidelines.length > 0
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
      const fileTypes = server.fileTypes.join(",");
      const actions = server.supportedActions.join(",");
      const actionText = actions.length > 0 ? ` | actions:${actions}` : "";
      return `lsp server coverage: ${server.name} | root:${root} | files:${fileTypes}${actionText}`;
    });

  const unavailable = servers
    .filter((server) => server.status !== "running")
    .map((server) => server.name);

  const dynamic = [...active];
  if (unavailable.length > 0) {
    dynamic.push(
      `lsp server unavailable: ${unavailable.join(",")} — install or enable for more coverage`,
    );
  }

  return dynamic;
}

function displayRoot(root: string, cwd: string): string {
  const relative = pathRelative(cwd, root);
  if (relative === "") return ".";
  return relative;
}

function pathRelative(from: string, to: string): string {
  const f = from.replace(/\\/g, "/");
  const t = to.replace(/\\/g, "/");
  if (t === f) return "";
  if (t.startsWith(`${f}/`)) return t.slice(f.length + 1);
  return t;
}
