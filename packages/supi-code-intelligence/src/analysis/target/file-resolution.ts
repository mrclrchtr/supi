/**
 * File-level resolution logic for code_resolve.
 *
 * Extracted from resolve/service.ts. Handles file-only resolution and
 * path-like query resolution for the code_resolve tool.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkspaceCodeIntelligenceSession } from "../../session/session.ts";
import type { CodeProvider } from "../provider.ts";
import { normalizePath } from "../search/ripgrep.ts";
import { resolveFileTargetGroup as resolveFile } from "./file.ts";
import {
  type ResolveServiceParams,
  type ResolveServiceResult,
  registerFromTarget,
} from "./resolve-common.ts";

/** Resolve file-only (no coordinates) input. */
export async function resolveFileOnlyInput(
  params: ResolveServiceParams,
  session: WorkspaceCodeIntelligenceSession,
  maxResults: number,
  provider: CodeProvider | null,
): Promise<ResolveServiceResult> {
  const cwd = session.cwd;
  const file = params.file;
  if (!file) {
    return { kind: "error", message: "**Error:** File required for file-level resolution." };
  }
  const resolvedFile = normalizePath(file, cwd);
  if (!existsSync(resolvedFile)) {
    return { kind: "error", message: `**Error:** File not found: \`${file}\`` };
  }
  const outcome = await resolveFile(file, cwd, {
    semantic: provider ?? undefined,
    structural: provider ?? undefined,
  });
  if (outcome.kind === "error") {
    return { kind: "error", message: outcome.message };
  }
  const targets = outcome.group.targets
    .slice(0, maxResults)
    .map((t) =>
      registerFromTarget({ ...t, position: t.position, confidence: t.confidence }, session, "file"),
    );
  return {
    kind: "resolved",
    targets,
    confidence: outcome.group.confidence,
    omittedCount: Math.max(0, outcome.group.targets.length - maxResults),
    nextQueries: [
      "Use `targetId` with `code_graph` for reference tracking",
      "Use `targetId` with `code_impact` for blast radius",
    ],
  };
}

/** Handle a path-like query with kind: "file". */
export async function resolvePathQuery(
  query: string,
  session: WorkspaceCodeIntelligenceSession,
  maxResults: number,
  provider: CodeProvider | null,
): Promise<ResolveServiceResult | null> {
  const cwd = session.cwd;
  const candidatePath = resolvePathLikeQuery(query, cwd);
  if (!candidatePath) return null;
  const outcome = await resolveFile(candidatePath, cwd, {
    semantic: provider ?? undefined,
    structural: provider ?? undefined,
  });
  if (outcome.kind === "error") return null;
  const targets = outcome.group.targets
    .slice(0, maxResults)
    .map((t) =>
      registerFromTarget({ ...t, position: t.position, confidence: t.confidence }, session, "file"),
    );
  return {
    kind: "resolved",
    targets,
    confidence: outcome.group.confidence,
    omittedCount: Math.max(0, outcome.group.targets.length - maxResults),
    nextQueries: [
      "Use `targetId` with `code_graph` for reference tracking",
      "Use `targetId` with `code_impact` for blast radius",
    ],
  };
}

/** Attempt file-level resolution when query looks like a file path. */
export async function tryPathLikeQuery(
  params: ResolveServiceParams,
  session: WorkspaceCodeIntelligenceSession,
  maxResults: number,
  provider: CodeProvider | null,
): Promise<ResolveServiceResult | null> {
  if (params.kind !== "file" && params.kind !== "File") return null;
  const query = params.query;
  if (!query || !isPathLike(query)) return null;
  return resolvePathQuery(query, session, maxResults, provider);
}

export function isPathLike(query: string): boolean {
  return (
    query.includes("/") || query.includes("\\") || query.endsWith(".ts") || query.endsWith(".js")
  );
}

/**
 * Attempt to resolve a path-like query string to an absolute file path.
 * Returns null if the path cannot be resolved to an existing file.
 */
export function resolvePathLikeQuery(query: string, cwd: string): string | null {
  const candidate = resolve(cwd, query);
  if (existsSync(candidate)) {
    return candidate;
  }
  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".json", ".md"]) {
    const withExt = candidate + ext;
    if (existsSync(withExt)) return withExt;
  }
  return null;
}
