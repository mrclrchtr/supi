import {
  createTreeSitterSession,
  getSessionTreeSitterService,
  type TreeSitterService,
} from "@mrclrchtr/supi-tree-sitter/api";

/**
 * Run work against the shared session-scoped Tree-sitter service when available,
 * falling back to a short-lived owned session otherwise.
 */
export async function withStructuralSession<T>(
  cwd: string,
  fn: (session: TreeSitterService) => Promise<T>,
): Promise<T> {
  const current = getSessionTreeSitterService(cwd);
  if (current.kind === "ready") {
    return fn(current.service);
  }

  const session = createTreeSitterSession(cwd);
  try {
    return await fn(session);
  } finally {
    session.dispose();
  }
}
