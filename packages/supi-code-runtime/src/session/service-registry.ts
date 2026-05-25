// Shared workspace-scoped service registry.
// Delegates to supi-core's createSessionStateRegistry for backing storage.

import { createSessionStateRegistry } from "@mrclrchtr/supi-core/session";

/**
 * Create a workspace-scoped state registry identified by a registry key.
 * This is a re-export of supi-core's shared helper for convenience;
 * provider packages may use it directly or wrap with typed accessors.
 */
export { createSessionStateRegistry };
