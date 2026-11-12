/** Project-root boundary for mutation requests on one routed client. */

import { realpathSync } from "node:fs";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";

/**
 * Return why a file cannot be refactored by the client routed to it, or null.
 *
 * A file without its own project markers routes to a server rooted at the
 * session directory. Its edits would fail the apply-time root check, so refuse
 * before the request. Real paths are compared, so a link inside the root
 * cannot reach an outside file.
 */
export function outsideRouteRootReason(file: string, root: string): string | null {
  return isWithinOrEqual(canonical(root), canonical(file))
    ? null
    : `File ${file} is outside the language server's project root ${root}.`;
}

function canonical(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}
