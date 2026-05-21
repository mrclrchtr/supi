import { createTreeSitterSession, type TreeSitterSession } from "@mrclrchtr/supi-tree-sitter/api";

/** Run work against a short-lived Tree-sitter session and dispose it afterward. */
export async function withStructuralSession<T>(
  cwd: string,
  fn: (session: TreeSitterSession) => Promise<T>,
): Promise<T> {
  const session = createTreeSitterSession(cwd);
  try {
    return await fn(session);
  } finally {
    session.dispose();
  }
}
