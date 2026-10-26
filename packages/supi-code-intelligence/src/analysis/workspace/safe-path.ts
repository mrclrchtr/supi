import { promises as fs } from "node:fs";
import * as path from "node:path";

/** Factual no-follow rejection; callers decide whether this is invalid input or a collection issue. */
export class WorkspaceSymlinkError extends Error {
  constructor(
    readonly requestedPath: string,
    readonly blockedPath: string,
  ) {
    super(`Symbolic-link path is not followed: ${blockedPath}`);
    this.name = "WorkspaceSymlinkError";
  }
}

/** Reject link traversal below the selected root, including a replaced root itself. */
export async function assertUnlinkedPath(
  root: string,
  relativePath: string,
  includeLeaf = false,
): Promise<void> {
  const parts = relativePath.split("/").filter((part) => part !== "." && part.length > 0);
  if (!includeLeaf) parts.pop();
  const requestedPath = path.resolve(root, relativePath);
  let current = root;
  if ((await fs.lstat(current)).isSymbolicLink())
    throw new WorkspaceSymlinkError(requestedPath, path.resolve(current));
  for (const part of parts) {
    current = path.join(current, part);
    if ((await fs.lstat(current)).isSymbolicLink())
      throw new WorkspaceSymlinkError(requestedPath, path.resolve(current));
  }
}
