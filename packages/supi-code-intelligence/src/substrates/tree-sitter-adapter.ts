// Tree-sitter structural substrate adapter — wraps the shared structural
// service into the StructuralSubstrate contract using the shared provider.

import {
  createTreeSitterSession,
  getSessionTreeSitterService,
} from "@mrclrchtr/supi-tree-sitter/api";
import { createTreeSitterProvider } from "@mrclrchtr/supi-tree-sitter/provider/tree-sitter-provider";
import type { StructuralSubstrate } from "./types.ts";

/**
 * Create a StructuralSubstrate backed by the tree-sitter service.
 * Reuses the shared session-scoped service when available, falling back to
 * a short-lived owned session (disposed after the operation).
 */
export function createStructuralSubstrate(cwd: string): StructuralSubstrate {
  const current = getSessionTreeSitterService(cwd);
  if (current.kind === "ready") {
    return createTreeSitterProvider(current.service);
  }

  const session = createTreeSitterSession(cwd);
  return createTreeSitterProvider(session);
}
